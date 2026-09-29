"""Repeatable demo chequing account, budgets, and transactions."""

import calendar
from datetime import date, timedelta

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import BankAccount, Budget, PlaidItem, Transaction, utcnow
from app.money import money
from app.services.budget_math import budget_period, current_budget_month
from app.services.users import category_by_name, get_local_user, seed_categories

DEMO_ITEM_ID = "demo-item"
DEMO_ACCOUNT_ID = "demo-chequing"


def _in_period(today: date, start_day: int, fraction: float) -> date:
    month, year = current_budget_month(today, start_day)
    start, end = budget_period(year, month, start_day)
    last = min(today, end) if start <= today <= end else end
    if last < start:
        last = start
    span = (last - start).days
    offset = min(span, max(0, round(fraction * span)))
    return start + timedelta(days=offset)


def clear_demo_data(db: Session) -> dict[str, int]:
    user = get_local_user(db)
    seed_categories(db)
    items = db.query(PlaidItem).filter(PlaidItem.user_id == user.id, PlaidItem.is_demo.is_(True)).all()
    item_ids = [item.id for item in items]
    accounts = []
    if item_ids:
        accounts = db.query(BankAccount).filter(BankAccount.plaid_item_id.in_(item_ids)).all()
    account_ids = [account.id for account in accounts]
    filters = [Transaction.is_demo.is_(True)]
    if account_ids:
        filters.append(Transaction.bank_account_id.in_(account_ids))
    deleted_tx = (
        db.query(Transaction)
        .filter(Transaction.user_id == user.id, or_(*filters))
        .delete(synchronize_session=False)
    )
    deleted_budgets = (
        db.query(Budget)
        .filter(Budget.user_id == user.id, Budget.is_demo.is_(True))
        .delete(synchronize_session=False)
    )
    deleted_accounts = 0
    if account_ids:
        deleted_accounts = (
            db.query(BankAccount).filter(BankAccount.id.in_(account_ids)).delete(synchronize_session=False)
        )
    deleted_items = (
        db.query(PlaidItem)
        .filter(PlaidItem.user_id == user.id, PlaidItem.is_demo.is_(True))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {
        "transactions": deleted_tx,
        "budgets": deleted_budgets,
        "accounts": deleted_accounts,
        "connections": deleted_items,
    }


def load_demo_data(db: Session, today: date | None = None) -> dict:
    """Replace demo records with a fixed month of sample spending.

    Includes a $20 Food purchase against a $200 Food budget ($180 remaining),
    one pending purchase, one category near its limit, and one over budget.
    """
    today = today or date.today()
    clear_demo_data(db)
    user = get_local_user(db)
    seed_categories(db)
    start_day = user.preference.budget_start_day if user.preference else 1
    month, year = current_budget_month(today, start_day)
    _start, end = budget_period(year, month, start_day)

    item = PlaidItem(
        user_id=user.id,
        institution_name="Demo Bank",
        encrypted_access_token=None,
        plaid_item_id=DEMO_ITEM_ID,
        transaction_cursor=None,
        status="demo",
        last_synced_at=utcnow(),
        is_demo=True,
        created_at=utcnow(),
    )
    db.add(item)
    db.flush()
    account = BankAccount(
        plaid_item_id=item.id,
        plaid_account_id=DEMO_ACCOUNT_ID,
        account_name="Chequing",
        official_name="Demo Chequing",
        account_type="depository",
        account_subtype="checking",
        current_balance=money("4280.42"),
        available_balance=money("4150.00"),
        currency="CAD",
        is_demo=True,
    )
    db.add(account)
    db.flush()

    limits = {
        "Food": "200.00",
        "Groceries": "150.00",
        "Transportation": "250.00",
        "Shopping": "120.00",
        "Entertainment": "60.00",
        "Bills": "180.00",
        "Education": "40.00",
        "Health": "75.00",
    }
    for name, limit in limits.items():
        category = category_by_name(db, name)
        existing = (
            db.query(Budget)
            .filter(
                Budget.user_id == user.id,
                Budget.category_id == category.id,
                Budget.month == month,
                Budget.year == year,
            )
            .one_or_none()
        )
        if existing is None:
            db.add(
                Budget(
                    user_id=user.id,
                    category_id=category.id,
                    month=month,
                    year=year,
                    limit_amount=money(limit),
                    is_demo=True,
                    created_at=utcnow(),
                    updated_at=utcnow(),
                )
            )
    db.flush()

    # fraction 1.0 is the most recent day in the open budget period.
    purchases = [
        ("demo-income", 0.02, "Payroll", "PAYROLL ACME", "Income", "-2450.00", False, "INCOME", "INCOME_WAGES"),
        ("demo-transfer", 0.18, "Transfer to Savings", "TRANSFER SAVINGS", "Transfer", "200.00", False, "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"),
        ("demo-health", 0.30, "Clinic Co-pay", "CLINIC CO-PAY", "Health", "22.00", False, "MEDICAL", "MEDICAL_PRIMARY_CARE"),
        ("demo-education", 0.38, "Campus Books", "CAMPUS BOOKS", "Education", "15.00", False, "GENERAL_SERVICES", "GENERAL_SERVICES_EDUCATION"),
        ("demo-shopping", 0.46, "Harbor Goods", "HARBOR GOODS", "Shopping", "45.00", False, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES"),
        ("demo-transit", 0.54, "Metro Line", "METRO LINE", "Transportation", "64.00", False, "TRANSPORTATION", "TRANSPORTATION_PUBLIC_TRANSIT"),
        ("demo-bills", 0.62, "Northwind Power", "NORTHWIND POWER", "Bills", "180.00", False, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY"),
        ("demo-arcade", 0.70, "Arcade Hall", "ARCADE HALL", "Entertainment", "30.00", False, "ENTERTAINMENT", "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS"),
        ("demo-stream", 0.76, "StreamBox", "STREAMBOX", "Entertainment", "48.50", False, "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"),
        ("demo-market-1", 0.82, "Fresh Market", "FRESH MARKET", "Groceries", "45.60", False, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
        ("demo-market-2", 0.88, "Fresh Market", "FRESH MARKET", "Groceries", "86.40", False, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
        ("demo-pending", 0.94, "City Transit", "CITY TRANSIT PENDING", "Transportation", "18.00", True, "TRANSPORTATION", "TRANSPORTATION_PUBLIC_TRANSIT"),
        ("demo-food", 1.00, "Corner Bistro", "CORNER BISTRO", "Food", "20.00", False, "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"),
    ]
    for plaid_id, fraction, merchant, original, category_name, amount, pending, primary, detailed in purchases:
        category = category_by_name(db, category_name)
        when = _in_period(today, start_day, fraction)
        last_day = calendar.monthrange(when.year, when.month)[1]
        if when.day > last_day:
            when = when.replace(day=last_day)
        if when > end:
            when = end
        db.add(
            Transaction(
                user_id=user.id,
                bank_account_id=account.id,
                plaid_transaction_id=plaid_id,
                merchant_name=merchant,
                original_name=original,
                amount=money(amount),
                transaction_date=when,
                pending=pending,
                category_id=category.id,
                plaid_primary_category=primary,
                plaid_detailed_category=detailed,
                user_overrode_category=False,
                is_demo=True,
                created_at=utcnow(),
                updated_at=utcnow(),
            )
        )
    db.commit()
    return {"month": month, "year": year, "transactions": len(purchases), "budgets": len(limits)}
