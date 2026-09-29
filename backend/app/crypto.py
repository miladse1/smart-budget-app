"""Encrypt Plaid access tokens before they touch the database."""

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


class EncryptionError(Exception):
    """Safe to show to the client. Never includes key material."""


def _fernet() -> Fernet:
    key = settings.app_encryption_key.strip()
    if not key:
        raise EncryptionError("Set APP_ENCRYPTION_KEY before connecting a bank.")
    try:
        return Fernet(key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise EncryptionError("APP_ENCRYPTION_KEY is not a valid Fernet key.") from exc


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        raise EncryptionError("Cannot store an empty bank token.")
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    try:
        return _fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise EncryptionError("The stored bank token could not be read.") from exc
