"""Plaid Link, token exchange, transaction sync and webhook verification.

Access tokens stay in this module. They are decrypted only immediately before a Plaid call
and are never returned, logged or stored in plaintext. Callers receive counts and safe
messages. This module never calls Plaid Transfer, payment or authorization endpoints.
"""

import hashlib
import hmac
import json
import logging
import threading
import time
from dataclasses import dataclass
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
from sqlalchemy.exc import OperationalError
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

try:
    from plaid.model.item_remove_request import ItemRemoveRequest
except ImportError:
    ItemRemoveRequest = None  # type: ignore[misc, assignment]

MAX_SYNC_PAGES = 50
MAX_SYNC_RESTARTS = 3
WEBHOOK_MAX_AGE_SECONDS = 5 * 60

# Plaid error codes that mean the person must reconnect through Link (update mode).
LOGIN_REQUIRED_CODES = {"ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "ACCESS_NOT_GRANTED", "INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND"}
# Temporary problems at Plaid or the bank. Safe to retry later with the same cursor.
RETRYABLE_TYPES = {"INSTITUTION_ERROR", "API_ERROR", "RATE_LIMIT_EXCEEDED"}
RETRYABLE_CODES = {"PRODUCT_NOT_READY", "INTERNAL_SERVER_ERROR", "PLANNED_MAINTENANCE"}
MUTATION_DURING_PAGINATION = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"


class PlaidError(Exception):
    """Safe client-facing Plaid failure. The message never includes tokens or raw responses."""

    def __init__(self, message: str, code: str | None = None, retryable: bool = False, login_required: bool = False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.login_required = login_required


@dataclass(frozen=True)
class _ErrorInfo:
    error_type: str
    error_code: str
    request_id: str


def _error_info(exc: Exception) -> _ErrorInfo:
    """Read only Plaid's error type, code and request id. The rest of the body is discarded."""
    body = getattr(exc, "body", None)
    parsed: dict[str, Any] = {}
    if isinstance(body, (str, bytes)):
        try:
            loaded = json.loads(body)
            parsed = loaded if isinstance(loaded, dict) else {}
        except (json.JSONDecodeError, TypeError, UnicodeDecodeError):
            parsed = {}
    return _ErrorInfo(
        error_type=str(parsed.get("error_type") or "unknown")[:64],
        error_code=str(parsed.get("error_code") or "unknown")[:64],
        request_id=str(parsed.get("request_id") or "-")[:64],
    )


def _failure(exc: Exception, action: str) -> PlaidError:
    info = _error_info(exc)
    # Plaid's request_id is a safe diagnostic reference for Plaid support.
    logger.warning(
        "Plaid %s failed error_type=%s error_code=%s plaid_request_id=%s",
        action,
        info.error_type,
        info.error_code,
        info.request_id,
    )
    if info.error_code in LOGIN_REQUIRED_CODES:
        return PlaidError(
            "Your bank needs you to sign in again. Reconnect it from Accounts.",
            code=info.error_code,
            login_required=True,
        )
    if info.error_code == MUTATION_DURING_PAGINATION:
        return PlaidError("Plaid updated transactions during sync.", code=info.error_code, retryable=True)
    if info.error_type in RETRYABLE_TYPES or info.error_code in RETRYABLE_CODES:
        return PlaidError(
            "Your bank or Plaid is temporarily unavailable. Try syncing again in a few minutes.",
            code=info.error_code,
            retryable=True,
        )
    messages = {
        "link token": "Plaid could not start a bank connection.",
        "token exchange": "Plaid could not finish connecting the bank.",
        "transactions sync": "Plaid could not sync transactions.",
        "item remove": "Plaid could not remove the connection.",
        "webhook key": "Webhook signature was rejected.",
    }
    return PlaidError(messages.get(action, "Plaid request failed."), code=info.error_code)


def _host() -> str:
    env = settings.plaid_environment
    if env == "production":
        if not settings.is_production:
            # Defence in depth: configuration validation already blocks this combination.
            raise PlaidError("Plaid production access is disabled outside APP_ENV=production.")
        return cast(str, plaid.Environment.Production)
    return cast(str, plaid.Environment.Sandbox)


def build_client() -> plaid_api.PlaidApi:
    configuration = plaid.Configuration(
        host=_host(),
        api_key={
            "clientId": settings.plaid_client_id,
            "secret": settings.plaid_secret,
        },
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration))


def create_link_token(user: User, access_token: str | None = None) -> dict:
    """Short-lived Link token for the browser. It cannot read data by itself."""
    client = build_client()
    kwargs: dict[str, Any] = {
        "client_name": "BudgetFlow",
        "country_codes": [CountryCode("CA"), CountryCode("US")],
        "language": "en",
        # An opaque internal id. Plaid never receives a name or email.
        "user": LinkTokenCreateRequestUser(client_user_id=str(user.id)),
    }
    if access_token:
        kwargs["access_token"] = access_token  # Update mode for ITEM_LOGIN_REQUIRED.
    else:
        kwargs["products"] = [Products("transactions")]
        if LinkTokenCreateRequestTransactions is not None:
            kwargs["transactions"] = LinkTokenCreateRequestTransactions(days_requested=180)
    if settings.plaid_webhook_url.strip():
        kwargs["webhook"] = settings.plaid_webhook_url.strip()
    try:
        response = client.link_token_create(LinkTokenCreateRequest(**kwargs)).to_dict()
    except Exception as exc:
        raise _failure(exc, "link token") from None
    return {
        "link_token": response.get("link_token"),
        "expiration": str(response.get("expiration")) if response.get("expiration") else None,
    }


def exchange_public_token(public_token: str) -> tuple[str, str]:
    client = build_client()
    try:
        response = client.item_public_token_exchange(ItemPublicTokenExchangeRequest(public_token=public_token)).to_dict()
    except Exception as exc:
        raise _failure(exc, "token exchange") from None
    access_token = response.get("access_token")
    item_id = response.get("item_id")
    if not access_token or not item_id:
        raise PlaidError("Plaid did not return a bank connection.")
    return str(access_token), str(item_id)


def pull_sync_page(access_token: str, cursor: str | None) -> dict:
    client = build_client()
    kwargs: dict[str, Any] = {"access_token": access_token, "count": 250}
    if cursor:
        kwargs["cursor"] = cursor
    try:
        return cast(dict, client.transactions_sync(TransactionsSyncRequest(**kwargs)).to_dict())
    except Exception as exc:
        raise _failure(exc, "transactions sync") from None


def remove_item_at_plaid(access_token: str) -> None:
    """Invalidate the access token at Plaid so it can never be used again."""
    if ItemRemoveRequest is None:
        raise PlaidError("Item removal is unavailable in this Plaid SDK build.")
    client = build_client()
    try:
        client.item_remove(ItemRemoveRequest(access_token=access_token))
    except Exception as exc:
        raise _failure(exc, "item remove") from None


def _lock_item(db: Session, item_id: int) -> PlaidItem:
    """Lock the connection row for this sync. A second sync of the same bank waits its turn."""
    try:
        return db.query(PlaidItem).filter(PlaidItem.id == item_id).with_for_update(nowait=True).one()
    except OperationalError:
        db.rollback()
        raise PlaidError("A sync for this bank is already running. Try again in a moment.", retryable=True) from None


def _mark_item(db: Session, item_id: int, status: str) -> None:
    db.rollback()
    item = db.query(PlaidItem).filter(PlaidItem.id == item_id).one_or_none()
    if item is not None and item.status != "disconnected":
        item.status = status
        db.commit()


def sync_item(db: Session, user: User, item: PlaidItem) -> dict[str, int]:
    """Apply every /transactions/sync page for one Item.

    All pages are applied inside one database transaction, and the new cursor is saved in
    that same commit. A failure part-way rolls everything back, so the next attempt restarts
    from the last fully applied cursor. Rows are upserted by Plaid transaction id, so a
    repeated page cannot create duplicates.
    """
    if item.user_id != user.id:
        raise PlaidError("Connection not found.")
    item_id = item.id
    restarts = 0
    while True:
        locked = _lock_item(db, item_id)
        if not locked.encrypted_access_token:
            db.rollback()
            raise PlaidError("This connection has no saved bank token. Connect the bank again.")
        try:
            access_token = decrypt_secret(locked.encrypted_access_token)
        except EncryptionError as exc:
            db.rollback()
            raise PlaidError(str(exc)) from None

        start_cursor = locked.transaction_cursor
        cursor = start_cursor
        totals = {"added": 0, "modified": 0, "removed": 0}
        try:
            for _page in range(MAX_SYNC_PAGES):
                page = pull_sync_page(access_token, cursor)
                counts = apply_sync_changes(
                    db,
                    user,
                    locked,
                    added=page.get("added") or [],
                    modified=page.get("modified") or [],
                    removed=page.get("removed") or [],
                    accounts=page.get("accounts") or [],
                )
                for key in totals:
                    totals[key] += counts[key]
                cursor = page.get("next_cursor") or cursor
                if not page.get("has_more"):
                    break
            else:
                # Every applied page and its cursor are consistent, so it is safe to save
                # progress here and continue from this cursor on the next sync.
                logger.info("Sync paused after %s pages item=%s", MAX_SYNC_PAGES, item_id)
        except PlaidError as exc:
            db.rollback()
            if exc.code == MUTATION_DURING_PAGINATION and restarts < MAX_SYNC_RESTARTS:
                restarts += 1
                continue
            if exc.login_required:
                _mark_item(db, item_id, "error")
            raise
        except Exception:
            db.rollback()
            raise
        finally:
            del access_token

        locked.transaction_cursor = cursor
        locked.last_synced_at = utcnow()
        locked.status = "active"
        db.commit()
        db.refresh(item)
        return totals


def connect_item(db: Session, user: User, public_token: str, institution_name: str | None) -> PlaidItem:
    access_token, plaid_item_id = exchange_public_token(public_token)
    try:
        encrypted = encrypt_secret(access_token)
    except EncryptionError as exc:
        raise PlaidError(str(exc)) from None
    finally:
        # The plaintext token is not stored and is not returned to the caller.
        del access_token

    item = db.query(PlaidItem).filter(PlaidItem.plaid_item_id == plaid_item_id).one_or_none()
    if item is not None and item.user_id != user.id:
        # Never move a bank connection between profiles.
        logger.warning("Refused to attach an Item that belongs to another profile")
        raise PlaidError("Plaid could not finish connecting the bank.")
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
        # Reconnecting the same Item (for example after ITEM_LOGIN_REQUIRED) keeps its cursor.
        item.encrypted_access_token = encrypted
        item.institution_name = (institution_name or item.institution_name)[:255]
        item.status = "active"
    db.commit()
    db.refresh(item)
    try:
        sync_item(db, user, item)
    except PlaidError:
        # The connection is saved. Transactions can be pulled with Sync or by webhook.
        logger.info("Bank connected; first transaction sync will retry item=%s", item.id)
    return item


def disconnect_item(db: Session, item: PlaidItem) -> bool:
    """Revoke the token at Plaid when possible, then delete it locally. History is kept.

    Returns True when Plaid confirmed the revocation. The local token is deleted either way,
    so BudgetFlow can no longer use it.
    """
    revoked = False
    if item.encrypted_access_token and settings.plaid_credentials_set and not item.is_demo:
        try:
            remove_item_at_plaid(decrypt_secret(item.encrypted_access_token))
            revoked = True
        except (PlaidError, EncryptionError):
            logger.warning("Could not revoke the Item at Plaid; deleting the local token anyway item=%s", item.id)
    item.encrypted_access_token = None
    item.transaction_cursor = None
    item.status = "disconnected"
    db.commit()
    return revoked


# ----------------------------------------------------------------------------- webhooks

_key_cache: dict[str, tuple[float, Any]] = {}
_key_lock = threading.Lock()
KEY_CACHE_SECONDS = 24 * 60 * 60


def _verification_key(kid: str) -> Any:
    """Plaid's JWK for this key id, cached. Expired keys are refused."""
    now = time.time()
    with _key_lock:
        cached = _key_cache.get(kid)
        if cached and cached[0] > now:
            return cached[1]
    if WebhookVerificationKeyGetRequest is None:
        raise PlaidError("Webhook verification is unavailable in this Plaid SDK build.")
    try:
        response = build_client().webhook_verification_key_get(WebhookVerificationKeyGetRequest(key_id=kid)).to_dict()
    except Exception as exc:
        raise _failure(exc, "webhook key") from None
    jwk = response.get("key") or {}
    if jwk.get("expired_at"):
        raise PlaidError("Webhook signature was rejected.")
    public_key = jwt.algorithms.ECAlgorithm.from_jwk(json.dumps(jwk))
    with _key_lock:
        _key_cache[kid] = (now + KEY_CACHE_SECONDS, public_key)
    return public_key


def clear_webhook_key_cache() -> None:
    with _key_lock:
        _key_cache.clear()


def verify_webhook(body: bytes, verification_header: str | None) -> None:
    """Verify Plaid's signed JWT: ES256 only, a known key, a fresh `iat`, and a body hash match.

    Every failure raises the same generic PlaidError so a caller learns nothing about why.
    """
    rejected = PlaidError("Webhook rejected.")
    if not verification_header or len(verification_header) > 4096:
        raise rejected
    try:
        header = jwt.get_unverified_header(verification_header)
    except jwt.PyJWTError:
        raise rejected from None
    # Check the algorithm before any network call, so "none" or HS256 tokens are refused outright.
    if header.get("alg") != "ES256" or not isinstance(header.get("kid"), str):
        raise rejected
    try:
        public_key = _verification_key(header["kid"])
        claims = jwt.decode(
            verification_header,
            cast(Any, public_key),
            algorithms=["ES256"],
            options={"require": ["iat"], "verify_aud": False},
        )
    except (PlaidError, jwt.PyJWTError, ValueError, KeyError):
        raise rejected from None

    issued_at = claims.get("iat")
    if not isinstance(issued_at, (int, float)) or abs(time.time() - float(issued_at)) > WEBHOOK_MAX_AGE_SECONDS:
        raise rejected
    claimed = claims.get("request_body_sha256")
    digest = hashlib.sha256(body).hexdigest()
    if not isinstance(claimed, str) or not hmac.compare_digest(digest, claimed):
        raise rejected
