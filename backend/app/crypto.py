"""Encrypt Plaid access tokens before they touch the database.

Tokens are encrypted with Fernet (AES-128-CBC with HMAC-SHA256). Decryption happens
only inside the Plaid service, immediately before a call to Plaid.
"""

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings

# Every Fernet token is url-safe base64 of a version byte 0x80, which encodes to "gAAAAA".
FERNET_PREFIX = "gAAAAA"
_PLAINTEXT_PREFIXES = ("access-", "public-", "link-")


class EncryptionError(Exception):
    """Safe to show to the client. Never includes key material or token values."""


def _fernet() -> Fernet:
    key = settings.app_encryption_key.strip()
    if not key:
        raise EncryptionError("Set APP_ENCRYPTION_KEY before connecting a bank.")
    try:
        return Fernet(key.encode("utf-8"))
    except (ValueError, TypeError):
        raise EncryptionError("APP_ENCRYPTION_KEY is not a valid Fernet key.") from None


def looks_encrypted(value: str) -> bool:
    return value.startswith(FERNET_PREFIX) and not value.startswith(_PLAINTEXT_PREFIXES)


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        raise EncryptionError("Cannot store an empty bank token.")
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # `from None` keeps the ciphertext and key out of chained tracebacks.
        raise EncryptionError("The stored bank token could not be read.") from None
