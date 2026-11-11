"""Single-owner sign-in, sessions, and request-origin checks."""

import hashlib
from datetime import timedelta

import pytest

from app.auth import SESSION_COOKIE, hash_passphrase, origin_allowed, verify_passphrase
from app.logging_utils import redact
from app.models import AuthSession, Budget, Category, utcnow
from app.services.users import get_local_user

PASSPHRASE = "correct horse battery staple"
PROTECTED = [
    ("GET", "/api/app"),
    ("GET", "/api/dashboard?year=2026&month=1"),
    ("GET", "/api/transactions?year=2026&month=1&page=1"),
    ("GET", "/api/accounts"),
    ("GET", "/api/settings"),
    ("POST", "/api/plaid/link-token"),
    ("POST", "/api/plaid/sync"),
    ("POST", "/api/demo/load"),
]


def _setup(client, passphrase=PASSPHRASE):
    return client.post("/api/auth/setup", json={"passphrase": passphrase})


# ------------------------------------------------------------------ first run and sign-in

def test_first_run_status(anon_client):
    assert anon_client.get("/api/auth/status").json() == {"owner_set": False, "signed_in": False}


@pytest.mark.parametrize("method,path", PROTECTED)
def test_financial_endpoints_require_a_session(anon_client, method, path):
    assert anon_client.request(method, path).status_code == 401


@pytest.mark.parametrize("method,path", PROTECTED[:5])
def test_financial_endpoints_still_closed_after_setup_without_cookie(anon_client, method, path):
    assert _setup(anon_client).status_code == 201
    anon_client.cookies.clear()
    assert anon_client.request(method, path).status_code == 401


def test_setup_keeps_existing_budgets(anon_client, db):
    owner = get_local_user(db)
    food = db.query(Category).filter(Category.name == "Food").one()
    db.add(Budget(user_id=owner.id, category_id=food.id, month=1, year=2026, limit_amount="200.00"))
    db.commit()
    assert _setup(anon_client).status_code == 201
    budgets = anon_client.get("/api/budgets?year=2026&month=1").json()
    assert [b["limit_amount"] for b in budgets] == ["200.00"]


def test_setup_only_once(anon_client):
    assert _setup(anon_client).status_code == 201
    assert _setup(anon_client, "another long passphrase").status_code == 409


def test_short_passphrase_is_refused_without_echo(anon_client):
    response = _setup(anon_client, "short-pw")
    assert response.status_code == 422
    assert "short-pw" not in response.text


def test_session_cookie_is_httponly_strict_and_scoped(anon_client):
    response = _setup(anon_client)
    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith(f"{SESSION_COOKIE}=")
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api" in cookie
    assert "session" not in response.json() and "token" not in response.text


def test_session_token_is_stored_hashed(anon_client, db):
    _setup(anon_client)
    token = anon_client.cookies.get(SESSION_COOKIE)
    stored = db.query(AuthSession).one()
    assert stored.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in stored.token_hash


def test_login_logout_cycle(anon_client):
    _setup(anon_client)
    assert anon_client.post("/api/auth/logout").status_code == 204
    assert anon_client.get("/api/app").status_code == 401
    assert anon_client.post("/api/auth/login", json={"passphrase": "wrong passphrase"}).status_code == 401
    assert anon_client.post("/api/auth/login", json={"passphrase": PASSPHRASE}).status_code == 200
    assert anon_client.get("/api/app").status_code == 200


def test_logged_out_token_cannot_be_reused(anon_client):
    _setup(anon_client)
    token = anon_client.cookies.get(SESSION_COOKIE)
    anon_client.post("/api/auth/logout")
    anon_client.cookies.set(SESSION_COOKIE, token, path="/api")
    assert anon_client.get("/api/app").status_code == 401


def test_sign_in_attempts_are_rate_limited(anon_client):
    _setup(anon_client)
    statuses = [anon_client.post("/api/auth/login", json={"passphrase": f"guess number {i}"}).status_code for i in range(9)]
    assert statuses[:8] == [401] * 8
    assert statuses[8] == 429


def test_change_passphrase_signs_out_other_browsers(anon_client, client):
    # `client` and `anon_client` share one database; `client` is already signed in as the owner.
    assert anon_client.post("/api/auth/login", json={"passphrase": PASSPHRASE}).status_code == 200
    changed = client.post(
        "/api/auth/change-passphrase",
        json={"current_passphrase": PASSPHRASE, "new_passphrase": "a brand new passphrase"},
    )
    assert changed.status_code == 200
    assert client.get("/api/app").status_code == 200
    assert anon_client.get("/api/app").status_code == 401
    assert anon_client.post("/api/auth/login", json={"passphrase": PASSPHRASE}).status_code == 401


def test_idle_and_expired_sessions_are_refused(client, db):
    row = db.query(AuthSession).one()
    row.last_seen_at = utcnow() - timedelta(hours=2)
    db.commit()
    assert client.get("/api/app").status_code == 401
    row.last_seen_at = utcnow()
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert client.get("/api/app").status_code == 401


# ------------------------------------------------------------------ cross-site and host checks

def test_cross_site_writes_are_refused(client):
    response = client.post("/api/demo/load", headers={"Origin": "https://attacker.example"})
    assert response.status_code == 403
    response = client.post("/api/demo/load", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 403
    assert client.post("/api/demo/load", headers={"Origin": "http://localhost:5173"}).status_code == 200


def test_webhook_is_not_blocked_by_the_origin_check(anon_client):
    # Plaid's servers send no Origin; the webhook is verified by its signature instead.
    response = anon_client.post("/api/plaid/webhook", json={"webhook_type": "TRANSACTIONS"})
    assert response.status_code != 403


def test_unknown_host_is_refused(client):
    assert client.get("/api/health", headers={"host": "attacker.example"}).status_code == 400


def test_origin_rules():
    allowed = ["http://localhost:5173"]
    assert origin_allowed("GET", "https://attacker.example", "cross-site", allowed)
    assert origin_allowed("POST", "http://localhost:5173", "same-origin", allowed)
    assert not origin_allowed("POST", "https://attacker.example", "cross-site", allowed)
    assert not origin_allowed("DELETE", None, "same-site", allowed)
    assert origin_allowed("POST", None, None, allowed)


# ------------------------------------------------------------------ hashing and logging

def test_passphrase_hash_is_salted_scrypt():
    first, second = hash_passphrase(PASSPHRASE), hash_passphrase(PASSPHRASE)
    assert first.startswith("scrypt$") and first != second
    assert verify_passphrase(PASSPHRASE, first)
    assert not verify_passphrase("not it", first)
    assert not verify_passphrase(PASSPHRASE, None)
    assert not verify_passphrase(PASSPHRASE, "garbage")


def test_passphrases_and_session_cookies_are_redacted_from_logs():
    line = 'body={"passphrase": "hunter2-hunter2"} cookie: bf_session=abc123def456'
    cleaned = redact(line)
    assert "hunter2" not in cleaned and "abc123def456" not in cleaned
