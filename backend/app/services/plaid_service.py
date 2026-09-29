"""Plaid Link, token exchange, and transaction sync.

Access tokens stay in this module. Callers receive account names and sync counts only.
This module never calls Plaid Transfer, payment, or authorization endpoints.
"""

import hashlib
import hmac
import json
import logging
import time
from typing import Any, cast

import jwt
import plaid
from plaid.api import plaid_api
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from sqlalchemy.orm import Session

from app.config import settings
from app.crypto import EncryptionError, decrypt_secret, encrypt_secret
from app.models import PlaidItem, User, utcnow
from app.services.sync import apply_sync_changes

logger = logging.getLogger("budgetflow.plaid")

try:
    from plaid.model.link_token_create_request_transactions import LinkTokenCreateRequestTransactions
except ImportError:  # Older SDK builds still accept the link token without this option.
    LinkTokenCreateRequestTransactions = None  # type: ignore[misc, assignment]

try:
    from plaid.model.webhook_verification_key_get_request import WebhookVerificationKeyGetRequest
except ImportError:
    WebhookVerificationKeyGetRequest = None  # type: ignore[misc, assignment]


class PlaidError(Exception):
    """Safe client-facing Plaid failure."""


def _host():
    env = settings.plaid_env
    if env == "production":
        return plaid.Environment.Production
    if env == "development":
        return getattr(plaid.Environment, "Development", "https://development.plaid.com")
    return plaid.Environment.Sandbox


def build_client() -> plaid_api.PlaidApi:
    configuration = plaid.Configuration(
        host=_host(),
        api_key={
            "clientId": settings.plaid_client_id,
            "secret": settings.plaid_secret,
        },
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration))


def _log_plaid_error(exc: Exception) -> None:
    code = "unknown"
    body = getattr(exc, "body", None)
    if isinstance(body, (str, bytes)):
        try:
            parsed = json.loads(body)
            code = str(parsed.get("error_code", "unknown"))
        except (json.JSONDecodeError, TypeError):
            code = "unparsed"
    logger.warning("Plaid request failed error_code=%s", code)


def create_link_token(user: User) -> dict:
    client = build_client()
    kwargs = {
        "products": [Products("transactions")],
        "client_name": "BudgetFlow",
        "country_codes": [CountryCode("CA"), CountryCode("US")],
        "language": "en",
        "user": LinkTokenCreateRequestUser(client_user_id=str(user.id)),
    }
    if settings.plaid_webhook_url.strip():
        kwargs["webhook"] = settings.plaid_webhook_url.strip()
    if LinkTokenCreateRequestTransactions is not None:
        kwargs["transactions"] = LinkTokenCreateRequestTransactions(days_requested=180)
    try:
        response = client.link_token_create(LinkTokenCreateRequest(**kwargs)).to_dict()
    except Exception as exc:
        _log_plaid_error(exc)
        raise PlaidError("Plaid could not start a bank connection.") from exc
    return {
        "link_token": response.get("link_token"),
        "expiration": str(response.get("expiration")) if response.get("expiration") else None,
    }


def exchange_public_token(public_token: str) -> tuple[str, str]:
    client = build_client()
    try:
        response = client.item_public_token_exchange(
            ItemPublicTokenExchangeRequest(public_token=public_token)
        ).to_dict()
    except Exception as exc:
        _log_plaid_error(exc)
        raise PlaidError("Plaid could not finish connecting the bank.") from exc
    access_token = response.get("access_token")
    item_id = response.get("item_id")
    if not access_token or not item_id:
        raise PlaidError("Plaid did not return a bank connection.")
    return str(access_token), str(item_id)


def pull_sync_page(access_token: str, cursor: str | None) -> dict:
    client = build_client()
    kwargs = {"access_token": access_token}
    if cursor:
        kwargs["cursor"] = cursor
    try:
        return client.transactions_sync(TransactionsSyncRequest(**kwargs)).to_dict()
    except Exception as exc:
        _log_plaid_error(exc)
        raise PlaidError("Plaid could not sync transactions.") from exc


def sync_item(db: Session, user: User, item: PlaidItem) -> dict[str, int]:
    if not item.encrypted_access_token:
        raise PlaidError("This connection has no saved bank token. Connect the bank again.")
    try:
        access_token = decrypt_secret(item.encrypted_access_token)
    except EncryptionError as exc:
        raise PlaidError(str(exc)) from exc

    totals = {"added": 0, "modified": 0, "removed": 0}
    cursor = item.transaction_cursor
    # Pages are applied before the cursor is saved, so a retry cannot skip rows.
    for _page in range(20):
        page = pull_sync_page(access_token, cursor)
        counts = apply_sync_changes(
            db,
            user,
            item,
            added=page.get("added") or [],
            modified=page.get("modified") or [],
            removed=page.get("removed") or [],
            accounts=page.get("accounts") or [],
        )
        for key in totals:
            totals[key] += counts[key]
        cursor = page.get("next_cursor") or cursor
        item.transaction_cursor = cursor
        db.commit()
        if not page.get("has_more"):
            break
    item.last_synced_at = utcnow()
    item.status = "active"
    db.commit()
    return totals


def connect_item(
    db: Session,
    user: User,
    public_token: str,
    institution_name: str | None,
) -> PlaidItem:
    access_token, plaid_item_id = exchange_public_token(public_token)
    try:
        encrypted = encrypt_secret(access_token)
    except EncryptionError as exc:
        raise PlaidError(str(exc)) from exc
    # The plaintext token is not stored and is not returned to the caller.
    del access_token

    item = db.query(PlaidItem).filter(PlaidItem.plaid_item_id == plaid_item_id).one_or_none()
    if item is None:
        item = PlaidItem(
            user_id=user.id,
            institution_name=(institution_name or "Connected bank")[:255],
            encrypted_access_token=encrypted,
            plaid_item_id=plaid_item_id,
            status="active",
            is_demo=False,
            created_at=utcnow(),
        )
        db.add(item)
    else:
        item.encrypted_access_token = encrypted
        item.institution_name = (institution_name or item.institution_name)[:255]
        item.status = "active"
        item.user_id = user.id
    db.commit()
    db.refresh(item)
    try:
        sync_item(db, user, item)
    except PlaidError:
        # The connection is saved. Transactions can be pulled with Sync.
        logger.info("Bank connected; transaction sync will retry item_id=%s", item.id)
    return item


def disconnect_item(db: Session, item: PlaidItem) -> None:
    """Remove the stored access token. Accounts and transactions stay."""
    item.encrypted_access_token = None
    item.transaction_cursor = None
    item.status = "disconnected"
    db.commit()


def verify_webhook(body: bytes, verification_header: str | None) -> None:
    """Confirm a Plaid webhook signature. Raises PlaidError when it does not match."""
    if not verification_header:
        raise PlaidError("Missing webhook signature.")
    if WebhookVerificationKeyGetRequest is None:
        raise PlaidError("Webhook verification is unavailable in this Plaid SDK build.")
    try:
        header = jwt.get_unverified_header(verification_header)
        kid = header["kid"]
        client = build_client()
        key_response = client.webhook_verification_key_get(
            WebhookVerificationKeyGetRequest(key_id=kid)
        ).to_dict()
        public_key = jwt.algorithms.ECAlgorithm.from_jwk(json.dumps(key_response["key"]))
        claims = jwt.decode(verification_header, cast(Any, public_key), algorithms=["ES256"])
    except PlaidError:
        raise
    except Exception as exc:
        _log_plaid_error(exc)
        raise PlaidError("Webhook signature was rejected.") from exc

    digest = hashlib.sha256(body).hexdigest()
    claimed = str(claims.get("request_body_sha256", ""))
    if not hmac.compare_digest(digest, claimed):
        raise PlaidError("Webhook body did not match its signature.")
    issued_at = float(claims.get("iat", 0))
    if abs(time.time() - issued_at) > 60 * 5:
        raise PlaidError("Webhook signature has expired.")
