"""Logging with secret redaction and request IDs.

The redaction filter is attached to every handler, not just a logger: filters on a logger
do not run for records that propagate from child loggers, so a logger-level filter would
miss messages from `budgetflow.plaid` or uvicorn. Exception tracebacks are redacted too.
"""

import contextvars
import logging
import re

from app.config import settings

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

REDACTED = "[redacted]"

# (pattern, replacement). Replacements keep labels such as "Bearer" or "secret=" so logs stay readable.
_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    # Plaid access, public and Link tokens in any environment.
    (re.compile(r"\b(?:access|public|link)-(?:sandbox|development|production)-[A-Za-z0-9-]+"), REDACTED),
    # Fernet ciphertext, i.e. an encrypted access token.
    (re.compile(r"gAAAAA[A-Za-z0-9_\-=]{20,}"), REDACTED),
    # Bearer and Basic credentials.
    (re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+"), rf"\1 {REDACTED}"),
    # Header-style values: Authorization, Cookie, Set-Cookie, Plaid-Verification.
    (re.compile(r"(?i)\b(authorization|cookie|set-cookie|plaid-verification)(\"?\s*[:=]\s*\"?)[^\s\",}]+"), rf"\1\2{REDACTED}"),
    # JSON or form fields that carry secrets.
    (
        re.compile(r"(?i)(\"?(?:secret|client_id|access_token|public_token|link_token|password|passphrase|current_passphrase|new_passphrase|api_key|bf_session)\"?\s*[:=]\s*\"?)[^\s\",}]+"),
        rf"\1{REDACTED}",
    ),
    # Passwords inside database or other connection URLs: scheme://user:password@host.
    (re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://[^:/\s@]+:)[^@\s]+@"), rf"\1{REDACTED}@"),
    # Long digit runs such as full account or routing numbers.
    (re.compile(r"\b\d{9,17}\b"), REDACTED),
)


def redact(text: str) -> str:
    if not text:
        return text
    for secret in (settings.plaid_secret, settings.plaid_client_id, settings.app_encryption_key):
        value = secret.strip()
        if len(value) >= 6 and value in text:
            text = text.replace(value, REDACTED)
    for pattern, replacement in _RULES:
        text = pattern.sub(replacement, text)
    return text


class RedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        try:
            message = record.getMessage()
        except Exception:  # A bad format string must not break logging.
            message = str(record.msg)
        cleaned = redact(message)
        if cleaned != message:
            record.msg = cleaned
            record.args = ()
        if record.exc_info:
            formatter = logging.Formatter()
            record.exc_text = redact(formatter.formatException(record.exc_info))
            # Keep the type for log levels and tooling, but drop the live objects and their values.
            record.exc_info = None
        if record.stack_info:
            record.stack_info = redact(record.stack_info)
        return True


_FILTER = RedactionFilter()


def install_redaction() -> None:
    """Attach the filter to every handler on the root logger and on uvicorn's loggers."""
    names = ["", "uvicorn", "uvicorn.error", "uvicorn.access", "budgetflow", "budgetflow.plaid", "sqlalchemy"]
    for name in names:
        for handler in logging.getLogger(name).handlers:
            if _FILTER not in handler.filters:
                handler.addFilter(_FILTER)


def configure_logging() -> None:
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s request_id=%(request_id)s %(message)s"))
        root.addHandler(handler)
        root.setLevel(logging.INFO)
    install_redaction()
