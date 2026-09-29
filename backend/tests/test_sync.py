"""Sync behaviour: duplicates, pending replacement, and manual categories."""

from datetime import date
from decimal import Decimal

from cryptography.fernet import Fernet

from app.config import settings
from app.models import BankAccount, Budget, PlaidItem, Transaction, utcnow
from app.money import money
from app.services.reporting import build_month_report
from app.services.sync import apply_sync_changes
from app.services.users import category_by_name, get_local_user, resolve_plaid_category


def _item_and_account(db):
    user = get_local_user(db)
    item = PlaidItem(
        user_id=user.id,
        institution_name="Test Bank",
        encrypted_access_token=None,
        plaid_item_id="item-test",
        status="active",
        is_demo=False,
        created_at=utcnow(),
    )
    db.add(item)
    db.flush()
    account = BankAccount(
        plaid_item_id=item.id,
        plaid_account_id="account-test",
        account_name="Chequing",
        official_name="Test Chequing",
        account_type="depository",
        account_subtype="checking",
        current_balance=money("100.00"),
        available_balance=money("100.00"),
        currency="CAD",
        is_demo=False,
    )
    db.add(account)
    db.flush()
    food = category_by_name(db, "Food")
    groceries = category_by_name(db, "Groceries")
    for category, limit in ((food, "200.00"), (groceries, "150.00")):
        db.add(
            Budget(
                user_id=user.id,
                category_id=category.id,
                month=9,
                year=2026,
                limit_amount=money(limit),
                is_demo=False,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    db.commit()
    return user, item


def _purchase(transaction_id: str, amount: str, detailed: str, pending: bool = False, pending_id: str | None = None):
    return {
        "transaction_id": transaction_id,
        "account_id": "account-test",
        "amount": float(amount),
        "date": "2026-09-12",
        "name": "CORNER BISTRO",
        "merchant_name": "Corner Bistro",
        "pending": pending,
        "pending_transaction_id": pending_id,
        "personal_finance_category": {"primary": "FOOD_AND_DRINK", "detailed": detailed},
    }


def _food_remaining(db, user) -> Decimal:
    report = build_month_report(db, user, 2026, 9)
    return next(row.remaining for row in report.budgets if row.name == "Food")


def test_plaid_category_mapping(db):
    assert resolve_plaid_category(db, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES").name == "Groceries"
    assert resolve_plaid_category(db, "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT").name == "Food"
    assert resolve_plaid_category(db, "INCOME", "INCOME_WAGES").name == "Income"
    assert resolve_plaid_category(db, "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS").name == "Transfer"
    assert resolve_plaid_category(db, "SOMETHING_NEW", None).name == "Other"


def test_duplicate_sync_does_not_insert_twice(db):
    user, item = _item_and_account(db)
    page = [_purchase("txn-1", "20.00", "FOOD_AND_DRINK_RESTAURANT")]
    apply_sync_changes(db, user, item, added=page, modified=[], removed=[], accounts=[])
    apply_sync_changes(db, user, item, added=page, modified=[], removed=[], accounts=[])
    db.commit()
    count = db.query(Transaction).filter(Transaction.plaid_transaction_id == "txn-1").count()
    assert count == 1
    assert _food_remaining(db, user) == Decimal("180.00")


def test_pending_transaction_is_replaced_by_posted(db):
    user, item = _item_and_account(db)
    pending = _purchase("pending-1", "20.00", "FOOD_AND_DRINK_RESTAURANT", pending=True)
    apply_sync_changes(db, user, item, added=[pending], modified=[], removed=[], accounts=[])
    posted = _purchase("posted-1", "20.00", "FOOD_AND_DRINK_RESTAURANT", pending_id="pending-1")
    apply_sync_changes(
        db,
        user,
        item,
        added=[posted],
        modified=[],
        removed=[{"transaction_id": "pending-1"}],
        accounts=[],
    )
    db.commit()
    rows = db.query(Transaction).all()
    assert len(rows) == 1
    assert rows[0].plaid_transaction_id == "posted-1"
    assert rows[0].pending is False
    assert rows[0].transaction_date == date(2026, 9, 12)
    assert _food_remaining(db, user) == Decimal("180.00")


def test_manual_category_updates_both_budgets_and_survives_sync(db):
    user, item = _item_and_account(db)
    apply_sync_changes(
        db,
        user,
        item,
        added=[_purchase("txn-1", "20.00", "FOOD_AND_DRINK_RESTAURANT")],
        modified=[],
        removed=[],
        accounts=[],
    )
    db.commit()
    txn = db.query(Transaction).filter(Transaction.plaid_transaction_id == "txn-1").one()
    groceries = category_by_name(db, "Groceries")
    txn.category_id = groceries.id
    txn.user_overrode_category = True
    db.commit()

    report = build_month_report(db, user, 2026, 9)
    assert next(row.spent for row in report.budgets if row.name == "Food") == Decimal("0.00")
    assert next(row.remaining for row in report.budgets if row.name == "Food") == Decimal("200.00")
    assert next(row.spent for row in report.budgets if row.name == "Groceries") == Decimal("20.00")
    assert next(row.remaining for row in report.budgets if row.name == "Groceries") == Decimal("130.00")

    changed = _purchase("txn-1", "20.00", "FOOD_AND_DRINK_RESTAURANT")
    apply_sync_changes(db, user, item, added=[], modified=[changed], removed=[], accounts=[])
    db.commit()
    db.refresh(txn)
    assert txn.user_overrode_category is True
    assert txn.category_id == groceries.id
    report = build_month_report(db, user, 2026, 9)
    assert next(row.spent for row in report.budgets if row.name == "Food") == Decimal("0.00")
    assert next(row.spent for row in report.budgets if row.name == "Groceries") == Decimal("20.00")


def test_disconnect_removes_token_and_keeps_transactions(db, monkeypatch):
    from app.crypto import encrypt_secret
    from app.services.plaid_service import disconnect_item

    user, item = _item_and_account(db)
    monkeypatch.setattr(settings, "app_encryption_key", Fernet.generate_key().decode())
    item.encrypted_access_token = encrypt_secret("access-sandbox-secret-token")
    apply_sync_changes(
        db,
        user,
        item,
        added=[_purchase("txn-1", "20.00", "FOOD_AND_DRINK_RESTAURANT")],
        modified=[],
        removed=[],
        accounts=[],
    )
    db.commit()
    disconnect_item(db, item)
    db.refresh(item)
    assert item.encrypted_access_token is None
    assert item.status == "disconnected"
    assert db.query(Transaction).count() == 1
    assert _food_remaining(db, user) == Decimal("180.00")
