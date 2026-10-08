"""Security properties: secrets stay server-side, tokens stay encrypted, logs are redacted,
records are isolated per profile, and webhooks are verified.

Every credential here is generated or fake. No test talks to Plaid.
"""

import hashlib
import io
import json
import logging
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app.config import Settings, configuration_problems, settings
from app.crypto import EncryptionError, decrypt_secret, encrypt_secret
from app.logging_utils import install_redaction, redact
from app.models import BankAccount, Budget, PlaidItem, Transaction, User, UserPreference, utcnow
from app.money import money
from app.services import plaid_service
from app.services.sync import apply_sync_changes
from app.services.users import category_by_name, get_local_user

FAKE_SECRET = "fake-plaid-secret-value-0001"
FAKE_CLIENT_ID = "fake-client-id-0001"
FAKE_ACCESS = "access-sandbox-00000000-1111-2222-3333-444444444444"


@pytest.fixture()
def key(monkeypatch) -> str:
    value = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "app_encryption_key", value)
    return value


@pytest.fixture()
def plaid_keys(monkeypatch, key) -> None:
    monkeypatch.setattr(settings, "plaid_client_id", FAKE_CLIENT_ID)
    monkeypatch.setattr(settings, "plaid_secret", FAKE_SECRET)


def _item(db, user, plaid_item_id="item-hidden-123", token: str | None = FAKE_ACCESS) -> PlaidItem:
    item = PlaidItem(
        user_id=user.id,
        institution_name="Test Bank",
        encrypted_access_token=encrypt_secret(token) if token else None,
        plaid_item_id=plaid_item_id,
        status="active",
        is_demo=False,
        created_at=utcnow(),
    )
    db.add(item)
    db.flush()
    return item


def _account(db, item, plaid_account_id="acct-hidden-123") -> BankAccount:
    account = BankAccount(
        plaid_item_id=item.id,
        plaid_account_id=plaid_account_id,
        account_name="Chequing",
        official_name=None,
        account_type="depository",
        account_subtype="checking",
        current_balance=money("100.00"),
        available_balance=money("90.00"),
        currency="CAD",
        is_demo=False,
    )
    db.add(account)
    db.flush()
    return account


def _purchase(txn_id, account_id="acct-hidden-123", amount="20.00", pending=False, pending_id=None, day="2026-09-10"):
    return {
        "transaction_id": txn_id,
        "account_id": account_id,
        "amount": amount,
        "date": day,
        "name": "CORNER BISTRO",
        "merchant_name": "Corner Bistro",
        "pending": pending,
        "pending_transaction_id": pending_id,
        "personal_finance_category": {"primary": "FOOD_AND_DRINK", "detailed": "FOOD_AND_DRINK_RESTAURANT"},
    }


# ------------------------------------------------------------------ token storage


def test_plaintext_access_token_cannot_be_persisted(db, key):
    user = get_local_user(db)
    with pytest.raises(ValueError):
        PlaidItem(user_id=user.id, institution_name="x", plaid_item_id="i", encrypted_access_token=FAKE_ACCESS)
    item = _item(db, user)
    with pytest.raises(ValueError):
        item.encrypted_access_token = FAKE_ACCESS
    with pytest.raises(ValueError):
        item.encrypted_access_token = "public-sandbox-abc"
    assert item.encrypted_access_token.startswith("gAAAAA")
    assert decrypt_secret(item.encrypted_access_token) == FAKE_ACCESS
    assert FAKE_ACCESS not in repr(item) and "item-hidden-123" not in repr(item)


def test_wrong_key_error_reveals_nothing(db, monkeypatch, key):
    ciphertext = encrypt_secret(FAKE_ACCESS)
    other = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "app_encryption_key", other)
    with pytest.raises(EncryptionError) as caught:
        decrypt_secret(ciphertext)
    text = str(caught.value)
    assert other not in text and ciphertext not in text and FAKE_ACCESS not in text
    assert caught.value.__cause__ is None


def test_api_never_decrypts_or_exposes_tokens_on_reads(db, client, monkeypatch, key):
    user = get_local_user(db)
    item = _item(db, user)
    account = _account(db, item)
    apply_sync_changes(db, user, item, added=[_purchase("plaid-txn-secret-id")], modified=[], removed=[], accounts=[])
    db.commit()

    def forbidden(_value):
        raise AssertionError("Read endpoints must not decrypt access tokens")

    monkeypatch.setattr(plaid_service, "decrypt_secret", forbidden)
    monkeypatch.setattr("app.routers.api.decrypt_secret", forbidden)
    stored = db.query(PlaidItem).filter(PlaidItem.id == item.id).one().encrypted_access_token
    for path in ("/api/app", "/api/dashboard?year=2026&month=9", "/api/accounts", "/api/settings", "/api/budgets", "/api/transactions?year=2026&month=9", "/openapi.json"):
        response = client.get(path)
        assert response.status_code == 200, path
        for marker in (FAKE_ACCESS, stored, key, "item-hidden-123", "acct-hidden-123", "plaid-txn-secret-id", "encrypted_access_token", "transaction_cursor"):
            assert marker not in response.text, (path, marker[:12])
    assert account.id in {acct["id"] for item_out in client.get("/api/accounts").json() for acct in item_out["accounts"]}


def test_link_token_response_contains_only_the_link_token(client, monkeypatch, plaid_keys):
    monkeypatch.setattr(
        "app.routers.api.create_link_token",
        lambda user, access_token=None: {"link_token": "link-sandbox-abc", "expiration": "2026-10-08T12:00:00Z"},
    )
    response = client.post("/api/plaid/link-token")
    assert response.status_code == 200
    assert set(response.json()) == {"link_token", "expiration"}
    assert FAKE_SECRET not in response.text and FAKE_CLIENT_ID not in response.text


def test_exchange_validation_never_echoes_the_submitted_token(client, plaid_keys):
    bad = "access-sandbox-should-never-be-echoed-0000"
    response = client.post("/api/plaid/exchange", json={"public_token": bad})
    assert response.status_code == 422
    assert bad not in response.text
    assert "public_token" in response.text


# ------------------------------------------------------------- configuration


def _settings(**values) -> Settings:
    base = {
        "app_env": "development",
        "plaid_env": "sandbox",
        "plaid_client_id": "",
        "plaid_secret": "",
        "app_encryption_key": "",
        "frontend_url": "http://localhost:5173",
        "plaid_webhook_url": "",
        "database_url": "sqlite://",
    }
    base.update(values)
    return Settings(_env_file=None, **base)


def test_safe_defaults_have_no_problems():
    assert configuration_problems(_settings()) == []
    assert _settings().plaid_environment == "sandbox"


@pytest.mark.parametrize(
    ("values", "variable"),
    [
        ({"app_encryption_key": "not-a-real-fernet-key-value"}, "APP_ENCRYPTION_KEY"),
        ({"frontend_url": "*"}, "FRONTEND_URL"),
        ({"frontend_url": "https://a.example.com/path"}, "FRONTEND_URL"),
        ({"plaid_env": "production"}, "PLAID_ENV"),
        ({"plaid_env": "development"}, "PLAID_ENV"),
        ({"plaid_env": "sandbox-typo"}, "PLAID_ENV"),
        ({"plaid_client_id": "only-the-id-is-set"}, "PLAID_CLIENT_ID"),
        ({"app_env": "staging"}, "APP_ENV"),
        ({"plaid_webhook_url": "http://insecure.example.com/hook"}, "PLAID_WEBHOOK_URL"),
        ({"app_env": "production", "frontend_url": "http://budget.example.com"}, "FRONTEND_URL"),
        ({"app_env": "production", "frontend_url": "https://budget.example.com"}, "APP_ENCRYPTION_KEY"),
    ],
)
def test_unsafe_configuration_is_reported_by_name_only(values, variable):
    problems = configuration_problems(_settings(**values))
    assert any(variable in problem for problem in problems), problems
    for value in values.values():
        if len(value) > 12:
            assert all(value not in problem for problem in problems)


def test_invalid_configuration_stops_startup_without_printing_values(monkeypatch, caplog):
    from app.main import ConfigurationError, app

    bad_key = "this-is-not-a-valid-fernet-key"
    monkeypatch.setattr(settings, "app_encryption_key", bad_key)
    monkeypatch.setattr(settings, "plaid_env", "production")
    with caplog.at_level(logging.ERROR), pytest.raises(ConfigurationError) as caught:
        with TestClient(app):
            pass
    assert bad_key not in str(caught.value)
    assert bad_key not in caplog.text
    assert "APP_ENCRYPTION_KEY" in caplog.text and "PLAID_ENV" in caplog.text


def test_cors_never_uses_a_wildcard(monkeypatch):
    from app.config import cors_origins

    monkeypatch.setattr(settings, "frontend_url", "*")
    assert cors_origins() == []
    monkeypatch.setattr(settings, "frontend_url", "http://localhost:5173")
    assert "*" not in cors_origins()


# ------------------------------------------------------------------- logging


def test_log_output_redacts_tokens_secrets_and_connection_strings(monkeypatch, caplog):
    monkeypatch.setattr(settings, "plaid_secret", FAKE_SECRET)
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    root = logging.getLogger()
    root.addHandler(handler)
    try:
        install_redaction()
        log = logging.getLogger("budgetflow.plaid")
        log.warning("token %s secret %s", FAKE_ACCESS, FAKE_SECRET)
        log.warning("Authorization: Bearer abc.def.ghi Cookie: session=xyz")
        log.warning("db postgresql+psycopg://budgetflow:hunter2pass@db:5432/budgetflow")
        log.warning("account 123456789012 public-sandbox-1234 link-sandbox-9876")
        try:
            raise RuntimeError(f"Plaid body {{'access_token': '{FAKE_ACCESS}'}}")
        except RuntimeError:
            log.exception("failed")
    finally:
        root.removeHandler(handler)
    output = stream.getvalue()
    for leaked in (FAKE_ACCESS, FAKE_SECRET, "abc.def.ghi", "session=xyz", "hunter2pass", "123456789012", "public-sandbox-1234", "link-sandbox-9876"):
        assert leaked not in output, leaked
    assert output.count("[redacted]") >= 8
    assert "postgresql+psycopg://budgetflow:[redacted]@db" in output


def test_plaid_error_logs_only_code_and_request_id(caplog):
    body = json.dumps(
        {
            "error_type": "ITEM_ERROR",
            "error_code": "ITEM_LOGIN_REQUIRED",
            "error_message": f"token {FAKE_ACCESS} needs login",
            "request_id": "req-123",
            "access_token": FAKE_ACCESS,
        }
    )
    with caplog.at_level(logging.WARNING, logger="budgetflow.plaid"):
        error = plaid_service._failure(SimpleNamespace(body=body), "transactions sync")
    assert error.login_required and error.code == "ITEM_LOGIN_REQUIRED"
    assert FAKE_ACCESS not in caplog.text and "needs login" not in caplog.text
    assert "ITEM_LOGIN_REQUIRED" in caplog.text and "req-123" in caplog.text
    assert FAKE_ACCESS not in str(error)


def test_unexpected_errors_return_a_reference_not_details(client, monkeypatch):
    def explode(*_args, **_kwargs):
        raise RuntimeError(f"boom {FAKE_ACCESS} postgresql://u:pw@h/db")

    monkeypatch.setattr("app.routers.api.build_month_report", explode)
    response = client.get("/api/dashboard?year=2026&month=9")
    assert response.status_code == 500
    assert FAKE_ACCESS not in response.text and "pw@h" not in response.text and "boom" not in response.text
    reference = response.headers["X-Request-ID"]
    assert reference in response.json()["detail"]


# --------------------------------------------------------------- HTTP surface


def test_security_headers(client):
    response = client.get("/api/health")
    headers = response.headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert headers["Cache-Control"] == "no-store"
    assert headers["X-Request-ID"]


def test_cors_allows_only_the_configured_origin(client):
    allowed = client.options(
        "/api/budgets", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"}
    )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    denied = client.options(
        "/api/budgets", headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"}
    )
    assert "access-control-allow-origin" not in denied.headers


def test_oversized_bodies_are_rejected(client):
    response = client.post(
        "/api/budgets",
        content=b'{"padding": "' + b"x" * (70 * 1024) + b'"}',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_connection_endpoints_are_rate_limited(client):
    statuses = [client.post("/api/plaid/link-token").status_code for _ in range(12)]
    assert statuses[:10] == [503] * 10  # Plaid is not configured in tests; the limiter runs first.
    assert statuses[10:] == [429, 429]
    limited = client.post("/api/plaid/link-token")
    assert int(limited.headers["Retry-After"]) >= 1


# --------------------------------------------------------- profile isolation


@pytest.fixture()
def other_profile(db, key):
    other = User(name="Someone Else", email="other@example.invalid", created_at=utcnow())
    db.add(other)
    db.flush()
    db.add(UserPreference(user_id=other.id, currency="CAD", budget_start_day=1))
    item = _item(db, other, plaid_item_id="item-other")
    account = _account(db, item, plaid_account_id="acct-other")
    food = category_by_name(db, "Food")
    budget = Budget(user_id=other.id, category_id=food.id, month=9, year=2026, limit_amount=money("50"), is_demo=False, created_at=utcnow(), updated_at=utcnow())
    db.add(budget)
    apply_sync_changes(db, other, item, added=[_purchase("other-txn", account_id="acct-other")], modified=[], removed=[], accounts=[])
    db.commit()
    txn = db.query(Transaction).filter(Transaction.user_id == other.id).one()
    return SimpleNamespace(user=other, item=item, account=account, budget=budget, txn=txn)


def test_one_profile_cannot_reach_another_profiles_records(db, client, other_profile, plaid_keys):
    o = other_profile
    assert client.put(f"/api/budgets/{o.budget.id}", json={"limit_amount": "1"}).status_code == 404
    assert client.delete(f"/api/budgets/{o.budget.id}").status_code == 404
    food = category_by_name(db, "Groceries")
    assert client.patch(f"/api/transactions/{o.txn.id}/category", json={"category_id": food.id}).status_code == 404
    assert client.post(f"/api/plaid/items/{o.item.id}/sync").status_code == 404
    assert client.post(f"/api/plaid/items/{o.item.id}/link-token").status_code == 404
    assert client.delete(f"/api/plaid/items/{o.item.id}").status_code == 404
    assert client.get(f"/api/dashboard?account_id={o.account.id}").status_code == 404
    assert client.get(f"/api/transactions?account_id={o.account.id}").status_code == 404
    listed = client.get("/api/accounts").text + client.get("/api/budgets?year=2026&month=9").text
    listed += client.get("/api/transactions?year=2026&month=9").text
    assert "Someone Else" not in listed and str(o.account.id) not in [str(a["id"]) for i in client.get("/api/accounts").json() for a in i["accounts"]]
    db.refresh(o.item)
    db.refresh(o.budget)
    assert o.item.encrypted_access_token is not None and o.budget.limit_amount == money("50")


def test_reconnect_cannot_take_over_another_profiles_item(db, monkeypatch, other_profile, plaid_keys):
    monkeypatch.setattr(plaid_service, "exchange_public_token", lambda token: ("access-sandbox-new", "item-other"))
    me = get_local_user(db)
    with pytest.raises(plaid_service.PlaidError):
        plaid_service.connect_item(db, me, "public-sandbox-abcdefgh", "Bank")
    db.refresh(other_profile.item)
    assert other_profile.item.user_id == other_profile.user.id


def test_sync_cannot_overwrite_another_profiles_account(db, other_profile, key):
    me = get_local_user(db)
    mine = _item(db, me, plaid_item_id="item-mine")
    apply_sync_changes(
        db,
        me,
        mine,
        added=[],
        modified=[],
        removed=[],
        accounts=[{"account_id": "acct-other", "name": "Hijacked", "type": "depository", "balances": {"current": 1}}],
    )
    db.commit()
    db.refresh(other_profile.account)
    assert other_profile.account.account_name == "Chequing"
    assert other_profile.account.plaid_item_id == other_profile.item.id


# ------------------------------------------------------------------- webhooks


class _FakeKeys:
    def __init__(self, jwk: dict):
        self.jwk = jwk
        self.calls = 0

    def webhook_verification_key_get(self, _request):
        self.calls += 1
        return SimpleNamespace(to_dict=lambda: {"key": self.jwk})


@pytest.fixture()
def signer(monkeypatch, plaid_keys):
    private_key = ec.generate_private_key(ec.SECP256R1())
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    jwk.update({"kid": "kid-1", "alg": "ES256", "expired_at": None})
    fake = _FakeKeys(jwk)
    monkeypatch.setattr(plaid_service, "build_client", lambda: fake)

    def sign(body: bytes, iat: float | None = None, alg: str = "ES256", body_for_hash: bytes | None = None) -> str:
        claims = {"iat": int(iat if iat is not None else time.time()), "request_body_sha256": hashlib.sha256(body_for_hash or body).hexdigest()}
        if alg == "ES256":
            return jwt.encode(claims, private_key, algorithm="ES256", headers={"kid": "kid-1"})
        return jwt.encode(claims, "shared-secret-guess-0000000000000000", algorithm=alg, headers={"kid": "kid-1"})

    sign.fake = fake  # type: ignore[attr-defined]
    return sign


def _post(client, body: bytes, token: str | None):
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Plaid-Verification"] = token
    return client.post("/api/plaid/webhook", content=body, headers=headers)


def test_valid_webhook_syncs_and_is_idempotent(db, client, monkeypatch, signer):
    user = get_local_user(db)
    _item(db, user, plaid_item_id="item-webhook")
    db.commit()
    calls: list[int] = []
    monkeypatch.setattr("app.routers.api.sync_item", lambda _db, _user, item: calls.append(item.id) or {"added": 0, "modified": 0, "removed": 0})
    body = json.dumps({"webhook_type": "TRANSACTIONS", "webhook_code": "SYNC_UPDATES_AVAILABLE", "item_id": "item-webhook"}).encode()
    first = _post(client, body, signer(body))
    second = _post(client, body, signer(body))  # Plaid can deliver the same event twice.
    assert first.status_code == second.status_code == 200
    assert first.json() == {"status": "synced"}
    assert len(calls) == 2
    assert signer.fake.calls == 1  # Verification key cached.


@pytest.mark.parametrize("case", ["missing", "malformed", "tampered", "expired", "future", "hs256", "none"])
def test_invalid_webhooks_are_rejected_identically(db, client, signer, case):
    body = json.dumps({"webhook_type": "TRANSACTIONS", "webhook_code": "SYNC_UPDATES_AVAILABLE", "item_id": "x"}).encode()
    token: str | None
    if case == "missing":
        token = None
    elif case == "malformed":
        token = "not-a-jwt"
    elif case == "tampered":
        token = signer(body, body_for_hash=b'{"different": true}')
    elif case == "expired":
        token = signer(body, iat=time.time() - 600)
    elif case == "future":
        token = signer(body, iat=time.time() + 600)
    elif case == "hs256":
        token = signer(body, alg="HS256")
    else:
        token = jwt.encode({"iat": int(time.time())}, None, algorithm="none", headers={"kid": "kid-1"})
    response = _post(client, body, token)
    assert response.status_code == 401
    assert response.json() == {"detail": "Invalid webhook."}
    if case in {"hs256", "none", "malformed", "missing"}:
        assert signer.fake.calls == 0  # Refused before any key lookup.


def test_item_webhooks_update_status_in_any_order(db, client, signer):
    user = get_local_user(db)
    item = _item(db, user, plaid_item_id="item-status")
    db.commit()
    repaired = json.dumps({"webhook_type": "ITEM", "webhook_code": "LOGIN_REPAIRED", "item_id": "item-status"}).encode()
    error = json.dumps(
        {"webhook_type": "ITEM", "webhook_code": "ERROR", "item_id": "item-status", "error": {"error_code": "ITEM_LOGIN_REQUIRED"}}
    ).encode()
    assert _post(client, error, signer(error)).json() == {"status": "updated"}
    db.refresh(item)
    assert item.status == "error"
    assert _post(client, error, signer(error)).status_code == 200  # Duplicate delivery is harmless.
    assert _post(client, repaired, signer(repaired)).json() == {"status": "updated"}
    db.refresh(item)
    assert item.status == "active"


def test_webhook_for_unknown_item_is_ignored(client, signer):
    body = json.dumps({"webhook_type": "TRANSACTIONS", "webhook_code": "SYNC_UPDATES_AVAILABLE", "item_id": "nope"}).encode()
    assert _post(client, body, signer(body)).json() == {"status": "ignored"}


# --------------------------------------------------------------- disconnect


def test_disconnect_revokes_at_plaid_then_deletes_the_token(db, client, monkeypatch, plaid_keys):
    user = get_local_user(db)
    item = _item(db, user)
    db.commit()
    revoked: list[str] = []
    monkeypatch.setattr(plaid_service, "remove_item_at_plaid", lambda token: revoked.append(token))
    assert client.delete(f"/api/plaid/items/{item.id}").status_code == 204
    db.refresh(item)
    assert revoked == [FAKE_ACCESS]
    assert item.encrypted_access_token is None and item.status == "disconnected"


def test_disconnect_still_deletes_the_token_when_plaid_is_down(db, monkeypatch, plaid_keys):
    user = get_local_user(db)
    item = _item(db, user)
    db.commit()

    def down(_token):
        raise plaid_service.PlaidError("Plaid could not remove the connection.", retryable=True)

    monkeypatch.setattr(plaid_service, "remove_item_at_plaid", down)
    assert plaid_service.disconnect_item(db, item) is False
    db.refresh(item)
    assert item.encrypted_access_token is None and item.status == "disconnected"
