"""Single-owner sign-in: passphrase hashing, server-side sessions, and cross-site checks.

BudgetFlow has one owner. On first run the owner creates a passphrase; after that every
financial endpoint needs a session. The browser holds the session token only in an HttpOnly,
SameSite=Strict cookie scoped to /api, so page scripts can never read it. The database stores
a SHA-256 hash of the token, so a copy of the database cannot be used to sign in.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import Settings
from app.models import AuthSession, User, utcnow

SESSION_COOKIE = "bf_session"
MIN_PASSPHRASE = 12
MAX_PASSPHRASE = 256

# scrypt is memory-hard and in the standard library. These parameters use 32 MB and take
# roughly 50-100 ms per check, which makes offline guessing expensive.
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**15, 8, 1
_SCRYPT_MAXMEM = 64 * 1024 * 1024
# Last-seen updates are written at most this often, so reads stay cheap.
_TOUCH_INTERVAL = timedelta(minutes=1)
_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _scrypt(passphrase: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(passphrase.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=_SCRYPT_MAXMEM, dklen=32)


def hash_passphrase(passphrase: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _scrypt(passphrase, salt, _SCRYPT_N, _SCRYPT_R, _SCRYPT_P)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_passphrase(passphrase: str, stored: str | None) -> bool:
    if not stored:
        # Same work as a real check, so timing does not reveal whether a passphrase exists.
        _scrypt(passphrase, b"\0" * 16, _SCRYPT_N, _SCRYPT_R, _SCRYPT_P)
        return False
    try:
        scheme, n, r, p, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = _scrypt(passphrase, bytes.fromhex(salt_hex), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _aware(value: datetime) -> datetime:
    # SQLite returns naive datetimes; every value here was written in UTC.
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def create_session(db: Session, user: User, config: Settings) -> str:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_token(token),
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(hours=config.session_hours),
        )
    )
    db.flush()
    return token


def session_for(db: Session, token: str | None, config: Settings) -> AuthSession | None:
    """The live session for a token, or None if it is unknown, revoked, expired, or idle too long."""
    if not token or len(token) > 128:
        return None
    row = db.query(AuthSession).filter(AuthSession.token_hash == hash_token(token)).one_or_none()
    if row is None or row.revoked_at is not None:
        return None
    now = utcnow()
    if _aware(row.expires_at) <= now or _aware(row.last_seen_at) + timedelta(minutes=config.session_idle_minutes) <= now:
        return None
    if now - _aware(row.last_seen_at) >= _TOUCH_INTERVAL:
        row.last_seen_at = now
        db.commit()
    return row


def revoke_sessions(db: Session, user: User, keep_token: str | None = None) -> int:
    keep = hash_token(keep_token) if keep_token else None
    now = utcnow()
    count = 0
    for row in db.query(AuthSession).filter(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None)):
        if row.token_hash != keep:
            row.revoked_at = now
            count += 1
    return count


def origin_allowed(method: str, origin: str | None, fetch_site: str | None, allowed_origins: list[str]) -> bool:
    """Cross-site request forgery check for state-changing requests.

    Browsers send Origin on every POST/PUT/PATCH/DELETE. Server-to-server callers such as
    Plaid's webhook send neither Origin nor Sec-Fetch-Site and are verified separately.
    """
    if method.upper() not in _UNSAFE_METHODS:
        return True
    if origin is not None:
        return origin.rstrip("/") in allowed_origins
    return fetch_site in (None, "same-origin", "none")
