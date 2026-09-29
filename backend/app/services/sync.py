"""Apply Plaid /transactions/sync pages to the local database.

Added, modified, and removed rows are all handled. A transaction id is unique
per user, so the same purchase cannot be inserted twice. A later sync will
not replace a category the user chose by hand.
"""

from sqlalchemy.orm import Session

from app.models import BankAccount, PlaidItem, Transaction, User, utcnow
from app.money import money, parse_date
from app.services.users import resolve_plaid_category


def _text(value: object, fallback: str = "") -> str:
    if value is None:
        return fallback
    return str(value)


def _mapping(raw: object) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, str):
        return {"transaction_id": raw}
    if isinstance(raw, dict):
        return raw
    if hasattr(raw, "to_dict"):
        return raw.to_dict()
    return {"transaction_id": _text(raw)}


def normalize_account(raw: object) -> dict:
    data = _mapping(raw)
    balances = _mapping(data.get("balances"))
    subtype = data.get("subtype")
    return {
        "account_id": _text(data.get("account_id")),
        "name": _text(data.get("name"), "Account"),
        "official_name": data.get("official_name"),
        "type": _text(data.get("type"), "other"),
        "subtype": _text(subtype) if subtype else None,
        "current": balances.get("current"),
        "available": balances.get("available"),
        "currency": _text(balances.get("iso_currency_code") or data.get("iso_currency_code") or "CAD", "CAD"),
    }


def normalize_transaction(raw: object) -> dict:
    data = _mapping(raw)
    finance = _mapping(data.get("personal_finance_category"))
    merchant = data.get("merchant_name") or data.get("name") or "Unknown merchant"
    pending_id = data.get("pending_transaction_id")
    return {
        "transaction_id": _text(data.get("transaction_id")),
        "account_id": _text(data.get("account_id")),
        "amount": money(data.get("amount", "0")),
        "date": parse_date(data.get("date")),
        "name": _text(data.get("name"), _text(merchant)),
        "merchant_name": _text(merchant),
        "pending": bool(data.get("pending", False)),
        "pending_transaction_id": _text(pending_id) if pending_id else None,
        "primary": finance.get("primary"),
        "detailed": finance.get("detailed"),
    }


def upsert_accounts(db: Session, item: PlaidItem, accounts: list[object], is_demo: bool = False) -> None:
    for raw in accounts:
        data = normalize_account(raw)
        if not data["account_id"]:
            continue
        row = (
            db.query(BankAccount)
            .filter(BankAccount.plaid_account_id == data["account_id"])
            .one_or_none()
        )
        current = money(data["current"]) if data["current"] is not None else None
        available = money(data["available"]) if data["available"] is not None else None
        if row is None:
            db.add(
                BankAccount(
                    plaid_item_id=item.id,
                    plaid_account_id=data["account_id"],
                    account_name=data["name"],
                    official_name=_text(data["official_name"]) or None,
                    account_type=data["type"],
                    account_subtype=data["subtype"],
                    current_balance=current,
                    available_balance=available,
                    currency=data["currency"][:3] or "CAD",
                    is_demo=is_demo,
                )
            )
        else:
            row.account_name = data["name"]
            row.official_name = _text(data["official_name"]) or None
            row.account_type = data["type"]
            row.account_subtype = data["subtype"]
            row.current_balance = current
            row.available_balance = available
            row.currency = data["currency"][:3] or row.currency
    db.flush()


def _drop_replaced_pending(db: Session, user: User) -> int:
    posted = (
        db.query(Transaction.pending_plaid_transaction_id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.pending_plaid_transaction_id.is_not(None),
        )
        .all()
    )
    pending_ids = [row[0] for row in posted if row[0]]
    if not pending_ids:
        return 0
    return (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.plaid_transaction_id.in_(pending_ids),
        )
        .delete(synchronize_session=False)
    )


def upsert_transaction(db: Session, user: User, item: PlaidItem, raw: object, is_demo: bool = False) -> str:
    """Insert or update one transaction. Returns added, modified, or skipped."""
    data = normalize_transaction(raw)
    if not data["transaction_id"]:
        return "skipped"
    account = (
        db.query(BankAccount)
        .filter(
            BankAccount.plaid_item_id == item.id,
            BankAccount.plaid_account_id == data["account_id"],
        )
        .one_or_none()
    )
    if account is None:
        return "skipped"
    category = resolve_plaid_category(
        db,
        str(data["primary"]) if data["primary"] else None,
        str(data["detailed"]) if data["detailed"] else None,
    )
    existing = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.plaid_transaction_id == data["transaction_id"],
        )
        .one_or_none()
    )
    if existing is None:
        db.add(
            Transaction(
                user_id=user.id,
                bank_account_id=account.id,
                plaid_transaction_id=data["transaction_id"],
                merchant_name=data["merchant_name"][:500],
                original_name=data["name"][:500],
                amount=data["amount"],
                transaction_date=data["date"],
                pending=data["pending"],
                category_id=category.id,
                plaid_primary_category=str(data["primary"]) if data["primary"] else None,
                plaid_detailed_category=str(data["detailed"]) if data["detailed"] else None,
                pending_plaid_transaction_id=data["pending_transaction_id"],
                user_overrode_category=False,
                is_demo=is_demo,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
        db.flush()
        return "added"

    existing.bank_account_id = account.id
    existing.merchant_name = data["merchant_name"][:500]
    existing.original_name = data["name"][:500]
    existing.amount = data["amount"]
    existing.transaction_date = data["date"]
    existing.pending = data["pending"]
    existing.plaid_primary_category = str(data["primary"]) if data["primary"] else None
    existing.plaid_detailed_category = str(data["detailed"]) if data["detailed"] else None
    existing.pending_plaid_transaction_id = data["pending_transaction_id"]
    existing.updated_at = utcnow()
    # A manual category must survive later bank syncs.
    if not existing.user_overrode_category:
        existing.category_id = category.id
    db.flush()
    return "modified"


def apply_sync_changes(
    db: Session,
    user: User,
    item: PlaidItem,
    added: list[object],
    modified: list[object],
    removed: list[object],
    accounts: list[object] | None = None,
    is_demo: bool = False,
) -> dict[str, int]:
    if accounts:
        upsert_accounts(db, item, accounts, is_demo=is_demo or item.is_demo)

    removed_count = 0
    for raw in removed:
        data = _mapping(raw)
        plaid_id = _text(data.get("transaction_id") if isinstance(data, dict) else raw)
        if not plaid_id:
            continue
        removed_count += (
            db.query(Transaction)
            .filter(Transaction.user_id == user.id, Transaction.plaid_transaction_id == plaid_id)
            .delete(synchronize_session=False)
        )

    added_count = 0
    modified_count = 0
    for raw in list(added) + list(modified):
        result = upsert_transaction(db, user, item, raw, is_demo=is_demo or item.is_demo)
        if result == "added":
            added_count += 1
        elif result == "modified":
            modified_count += 1

    removed_count += _drop_replaced_pending(db, user)
    return {"added": added_count, "modified": modified_count, "removed": removed_count}
