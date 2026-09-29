"""Pure budget maths. These functions do not touch the database.

Plaid amount sign:
- positive means money left the account (a purchase)
- negative means money entered the account (income or a refund)

Income and Transfer never reduce an expense budget.
A pending transaction is ignored once a posted transaction points at it.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from app.category_data import NON_EXPENSE_CATEGORIES
from app.money import ZERO, money

PREVIEW_ORDER = [
    "Food",
    "Groceries",
    "Transportation",
    "Shopping",
    "Entertainment",
    "Bills",
    "Education",
    "Health",
    "Other",
]
NEAR_LIMIT_PERCENT = 85


@dataclass(frozen=True)
class SpendTxn:
    amount: Decimal
    category_name: str
    plaid_transaction_id: str
    pending_plaid_transaction_id: str | None = None
    pending: bool = False


def budget_period(year: int, month: int, start_day: int) -> tuple[date, date]:
    """Inclusive start and end for the budget named by year and month."""
    last_day = calendar.monthrange(year, month)[1]
    start = date(year, month, min(start_day, last_day))
    if month == 12:
        next_year, next_month = year + 1, 1
    else:
        next_year, next_month = year, month + 1
    next_last = calendar.monthrange(next_year, next_month)[1]
    next_start = date(next_year, next_month, min(start_day, next_last))
    return start, next_start - timedelta(days=1)


def current_budget_month(today: date, start_day: int) -> tuple[int, int]:
    start, _end = budget_period(today.year, today.month, start_day)
    if today < start:
        if today.month == 1:
            return 12, today.year - 1
        return today.month - 1, today.year
    return today.month, today.year


def previous_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def dedupe_transactions(txns: list[SpendTxn]) -> list[SpendTxn]:
    """One row per Plaid id. A posted copy wins over a pending copy."""
    chosen: dict[str, SpendTxn] = {}
    for txn in txns:
        current = chosen.get(txn.plaid_transaction_id)
        if current is None or (current.pending and not txn.pending):
            chosen[txn.plaid_transaction_id] = txn
    return list(chosen.values())


def active_transactions(txns: list[SpendTxn]) -> list[SpendTxn]:
    """Drop the pending copy when the posted purchase is already present."""
    unique = dedupe_transactions(txns)
    replaced = {txn.pending_plaid_transaction_id for txn in unique if txn.pending_plaid_transaction_id}
    return [txn for txn in unique if txn.plaid_transaction_id not in replaced]


def expense_amount(txn: SpendTxn) -> Decimal:
    if txn.category_name in NON_EXPENSE_CATEGORIES:
        return ZERO
    return money(txn.amount)


def income_amount(txn: SpendTxn) -> Decimal:
    """Income displayed as a positive number. Plaid stores inflows as negative."""
    if txn.category_name != "Income":
        return ZERO
    return money(-txn.amount)


def spent_for_category(txns: list[SpendTxn], category_name: str) -> Decimal:
    if category_name in NON_EXPENSE_CATEGORIES:
        return ZERO
    total = ZERO
    for txn in active_transactions(txns):
        if txn.category_name == category_name:
            total += expense_amount(txn)
    return money(total)


def remaining_amount(limit_amount: Decimal, spent: Decimal) -> Decimal:
    return money(limit_amount - spent)


def percent_used(spent: Decimal, limit_amount: Decimal) -> int:
    if limit_amount <= 0:
        return 0
    ratio = (spent / limit_amount) * Decimal(100)
    return int(ratio.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def budget_status(spent: Decimal, limit_amount: Decimal) -> str:
    if spent > limit_amount:
        return "over"
    if percent_used(spent, limit_amount) >= NEAR_LIMIT_PERCENT:
        return "near"
    return "ok"


def over_amount(spent: Decimal, limit_amount: Decimal) -> Decimal:
    if spent <= limit_amount:
        return ZERO
    return money(spent - limit_amount)


@dataclass(frozen=True)
class BudgetFigures:
    name: str
    limit_amount: Decimal
    spent: Decimal
    remaining: Decimal
    percent: int
    status: str
    over_amount: Decimal


def figures_for(name: str, limit_amount: Decimal, txns: list[SpendTxn]) -> BudgetFigures:
    spent = spent_for_category(txns, name)
    limit_value = money(limit_amount)
    return BudgetFigures(
        name=name,
        limit_amount=limit_value,
        spent=spent,
        remaining=remaining_amount(limit_value, spent),
        percent=percent_used(spent, limit_value),
        status=budget_status(spent, limit_value),
        over_amount=over_amount(spent, limit_value),
    )


def preview_names(rows: list[BudgetFigures], limit: int = 5) -> list[str]:
    """Show over-budget and near-limit categories first, then everyday categories."""

    def rank(row: BudgetFigures) -> tuple[int, int]:
        group = 0 if row.status == "over" else 1 if row.status == "near" else 2
        try:
            preferred = PREVIEW_ORDER.index(row.name)
        except ValueError:
            preferred = len(PREVIEW_ORDER)
        return group, preferred

    ordered = sorted(rows, key=rank)
    return [row.name for row in ordered[:limit]]
