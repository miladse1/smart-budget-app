"""Load transactions for a month and calculate budget figures."""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session, joinedload

from app.models import BankAccount, Budget, PlaidItem, Transaction, User
from app.money import ZERO, money, money_str
from app.services.budget_math import (
    BudgetFigures,
    SpendTxn,
    active_transactions,
    budget_period,
    figures_for,
    income_amount,
    preview_names,
)


@dataclass
class BudgetView:
    budget_id: int
    category_id: int
    name: str
    colour: str
    icon: str
    limit_amount: Decimal
    spent: Decimal
    remaining: Decimal
    percent: int
    status: str
    over_amount: Decimal
    is_demo: bool


@dataclass
class MonthReport:
    year: int
    month: int
    period_start: date
    period_end: date
    currency: str
    budgets: list[BudgetView]
    preview: list[BudgetView]
    transactions: list[Transaction]
    spent: Decimal
    income: Decimal
    remaining: Decimal
    total_budget: Decimal
    insight: str
    last_synced_at: datetime | None


def _spend_txn(txn: Transaction) -> SpendTxn:
    return SpendTxn(
        amount=money(txn.amount),
        category_name=txn.category.name,
        plaid_transaction_id=txn.plaid_transaction_id,
        pending_plaid_transaction_id=txn.pending_plaid_transaction_id,
        pending=txn.pending,
    )


def _insight(views: list[BudgetView]) -> str:
    if not views:
        return "Add a category budget to compare spending with your plan."
    over = [view for view in views if view.status == "over"]
    if over:
        worst = max(over, key=lambda view: view.over_amount)
        return f"{worst.name} is over budget by ${money_str(worst.over_amount)}."
    richest = max(views, key=lambda view: view.remaining)
    return (
        f"{richest.name} has ${money_str(richest.remaining)} remaining "
        f"of its ${money_str(richest.limit_amount)} budget."
    )


def build_month_report(
    db: Session,
    user: User,
    year: int,
    month: int,
    account_id: int | None = None,
) -> MonthReport:
    preference = user.preference
    start_day = preference.budget_start_day if preference else 1
    currency = preference.currency if preference else "CAD"
    period_start, period_end = budget_period(year, month, start_day)

    query = (
        db.query(Transaction)
        .options(joinedload(Transaction.category), joinedload(Transaction.bank_account))
        .filter(
            Transaction.user_id == user.id,
            Transaction.transaction_date >= period_start,
            Transaction.transaction_date <= period_end,
        )
    )
    if account_id is not None:
        query = query.filter(Transaction.bank_account_id == account_id)
    stored = query.all()
    spend_txns = [_spend_txn(txn) for txn in stored]
    active_ids = {txn.plaid_transaction_id for txn in active_transactions(spend_txns)}
    visible = [txn for txn in stored if txn.plaid_transaction_id in active_ids]

    budgets = (
        db.query(Budget)
        .options(joinedload(Budget.category))
        .filter(Budget.user_id == user.id, Budget.year == year, Budget.month == month)
        .all()
    )
    views: list[BudgetView] = []
    for budget in budgets:
        figures: BudgetFigures = figures_for(budget.category.name, money(budget.limit_amount), spend_txns)
        views.append(
            BudgetView(
                budget_id=budget.id,
                category_id=budget.category_id,
                name=figures.name,
                colour=budget.category.colour,
                icon=budget.category.icon,
                limit_amount=figures.limit_amount,
                spent=figures.spent,
                remaining=figures.remaining,
                percent=figures.percent,
                status=figures.status,
                over_amount=figures.over_amount,
                is_demo=budget.is_demo,
            )
        )
    views.sort(key=lambda view: view.name)
    wanted = set(preview_names(
        [
            BudgetFigures(
                name=view.name,
                limit_amount=view.limit_amount,
                spent=view.spent,
                remaining=view.remaining,
                percent=view.percent,
                status=view.status,
                over_amount=view.over_amount,
            )
            for view in views
        ]
    ))
    preview = [view for view in views if view.name in wanted]
    # Keep the urgency order from preview_names.
    order = preview_names(
        [
            BudgetFigures(view.name, view.limit_amount, view.spent, view.remaining, view.percent, view.status, view.over_amount)
            for view in views
        ]
    )
    preview.sort(key=lambda view: order.index(view.name))

    # Spent matches the category budgets so remaining = total budget - spent.
    spent = money(sum((view.spent for view in views), ZERO))
    income = money(sum((income_amount(_spend_txn(txn)) for txn in visible), ZERO))
    total_budget = money(sum((view.limit_amount for view in views), ZERO))
    remaining = money(sum((view.remaining for view in views), ZERO))

    last_sync_values = [
        item.last_synced_at
        for item in db.query(PlaidItem).filter(PlaidItem.user_id == user.id).all()
        if item.last_synced_at is not None
    ]
    last_synced_at = max(last_sync_values) if last_sync_values else None
    visible.sort(key=lambda txn: (txn.transaction_date, txn.id), reverse=True)

    return MonthReport(
        year=year,
        month=month,
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        budgets=views,
        preview=preview,
        transactions=visible,
        spent=spent,
        income=income,
        remaining=remaining,
        total_budget=total_budget,
        insight=_insight(views),
        last_synced_at=last_synced_at,
    )


def list_accounts(db: Session, user: User) -> list[BankAccount]:
    return (
        db.query(BankAccount)
        .join(PlaidItem)
        .options(joinedload(BankAccount.plaid_item))
        .filter(PlaidItem.user_id == user.id)
        .order_by(BankAccount.account_name)
        .all()
    )
