"""Decimal helpers. Financial values are never stored or summed as floats."""

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

TWOPLACES = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value: object) -> Decimal:
    """Convert a Plaid or form value to cents-safe Decimal without using binary floats."""
    if isinstance(value, Decimal):
        amount = value
    elif isinstance(value, bool):
        raise ValueError("Amount is not a number")
    elif isinstance(value, int):
        amount = Decimal(value)
    elif isinstance(value, float):
        # str(float) keeps the shortest round-trip, then we quantize to cents.
        amount = Decimal(str(value))
    else:
        text = str(value).strip().replace(",", "")
        if not text:
            raise ValueError("Amount is required")
        amount = Decimal(text)
    return amount.quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def money_str(value: Decimal) -> str:
    return f"{money(value):.2f}"


def parse_date(value: object) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value)[:10]
    return date.fromisoformat(text)
