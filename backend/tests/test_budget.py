"""Budget figures: the $20 Food purchase, income, transfers, and overspending."""

from datetime import date
from decimal import Decimal

from app.models import utcnow
from app.money import money
from app.services.budget_math import (
    SpendTxn,
    budget_period,
    current_budget_month,
    figures_for,
    remaining_amount,
    spent_for_category,
)
from app.services.demo_data import load_demo_data
from app.services.reporting import build_month_report
from app.services.users import get_local_user


def _food_purchase() -> list[SpendTxn]:
    return [
        SpendTxn(amount=money("20.00"), category_name="Food", plaid_transaction_id="food-1"),
    ]


def test_two_hundred_food_budget_minus_twenty_is_one_eighty():
    figures = figures_for("Food", money("200.00"), _food_purchase())
    assert figures.spent == Decimal("20.00")
    assert remaining_amount(money("200.00"), figures.spent) == Decimal("180.00")
    assert figures.remaining == Decimal("180.00")
    assert figures.percent == 10
    assert figures.status == "ok"


def test_categories_do_not_share_spending():
    txns = _food_purchase() + [
        SpendTxn(amount=money("15.00"), category_name="Groceries", plaid_transaction_id="groceries-1"),
    ]
    assert spent_for_category(txns, "Food") == Decimal("20.00")
    assert spent_for_category(txns, "Groceries") == Decimal("15.00")
    assert figures_for("Food", money("200"), txns).remaining == Decimal("180.00")
    assert figures_for("Groceries", money("150"), txns).remaining == Decimal("135.00")


def test_income_and_transfers_do_not_reduce_expense_budgets():
    txns = [
        SpendTxn(amount=money("20.00"), category_name="Food", plaid_transaction_id="food-1"),
        SpendTxn(amount=money("-5.00"), category_name="Food", plaid_transaction_id="food-refund"),
        SpendTxn(amount=money("-2450.00"), category_name="Income", plaid_transaction_id="pay-1"),
        SpendTxn(amount=money("200.00"), category_name="Transfer", plaid_transaction_id="transfer-1"),
    ]
    # The refund is negative in Plaid's sign, so it reduces Food spending.
    # Income and the transfer do not.
    figures = figures_for("Food", money("200.00"), txns)
    assert figures.spent == Decimal("15.00")
    assert figures.remaining == Decimal("185.00")
    assert spent_for_category(txns, "Income") == Decimal("0.00")
    assert spent_for_category(txns, "Transfer") == Decimal("0.00")


def test_duplicate_plaid_ids_are_counted_once():
    txns = [
        SpendTxn(amount=money("20.00"), category_name="Food", plaid_transaction_id="same"),
        SpendTxn(amount=money("20.00"), category_name="Food", plaid_transaction_id="same"),
    ]
    assert spent_for_category(txns, "Food") == Decimal("20.00")


def test_pending_and_posted_versions_are_not_both_counted():
    txns = [
        SpendTxn(
            amount=money("20.00"),
            category_name="Food",
            plaid_transaction_id="pending-1",
            pending=True,
        ),
        SpendTxn(
            amount=money("22.00"),
            category_name="Food",
            plaid_transaction_id="posted-1",
            pending_plaid_transaction_id="pending-1",
            pending=False,
        ),
    ]
    assert spent_for_category(txns, "Food") == Decimal("22.00")


def test_over_budget_is_negative_remaining():
    txns = [
        SpendTxn(amount=money("48.50"), category_name="Entertainment", plaid_transaction_id="e1"),
        SpendTxn(amount=money("30.00"), category_name="Entertainment", plaid_transaction_id="e2"),
    ]
    figures = figures_for("Entertainment", money("60.00"), txns)
    assert figures.spent == Decimal("78.50")
    assert figures.remaining == Decimal("-18.50")
    assert figures.over_amount == Decimal("18.50")
    assert figures.status == "over"


def test_budget_period_uses_start_day_and_utc_timestamps():
    start, end = budget_period(2026, 8, 15)
    assert start == date(2026, 8, 15)
    assert end == date(2026, 9, 14)
    assert current_budget_month(date(2026, 9, 10), 15) == (8, 2026)
    assert current_budget_month(date(2026, 9, 28), 1) == (9, 2026)
    stamp = utcnow()
    assert stamp.tzinfo is not None


def test_demo_food_purchase_leaves_one_eighty(db):
    load_demo_data(db, today=date(2026, 9, 20))
    user = get_local_user(db)
    report = build_month_report(db, user, 2026, 9)
    food = next(row for row in report.budgets if row.name == "Food")
    entertainment = next(row for row in report.budgets if row.name == "Entertainment")
    groceries = next(row for row in report.budgets if row.name == "Groceries")
    assert food.limit_amount == Decimal("200.00")
    assert food.spent == Decimal("20.00")
    assert food.remaining == Decimal("180.00")
    assert entertainment.status == "over"
    assert entertainment.remaining == Decimal("-18.50")
    assert groceries.status == "near"
    assert report.income == Decimal("2450.00")
    assert report.spent == Decimal("574.50")
    assert report.total_budget == Decimal("1075.00")
    assert report.remaining == Decimal("500.50")
    pending = [txn for txn in report.transactions if txn.pending]
    assert len(pending) == 1
    assert pending[0].merchant_name == "City Transit"
    assert "Food" in [row.name for row in report.preview]
