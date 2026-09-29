"""Map database rows into API responses."""

from app.category_data import NON_EXPENSE_CATEGORIES
from app.models import BankAccount, Transaction
from app.schemas import AccountOut, BudgetOut, TransactionOut
from app.services.reporting import BudgetView


def budget_out(view: BudgetView, month: int, year: int) -> BudgetOut:
    return BudgetOut(
        id=view.budget_id,
        category_id=view.category_id,
        name=view.name,
        colour=view.colour,
        icon=view.icon,
        month=month,
        year=year,
        limit_amount=view.limit_amount,
        spent=view.spent,
        remaining=view.remaining,
        percent=view.percent,
        status=view.status,
        over_amount=view.over_amount,
    )


def transaction_out(txn: Transaction) -> TransactionOut:
    return TransactionOut(
        id=txn.id,
        transaction_date=txn.transaction_date,
        merchant_name=txn.merchant_name,
        original_name=txn.original_name,
        account_id=txn.bank_account_id,
        account_name=txn.bank_account.account_name,
        category_id=txn.category_id,
        category_name=txn.category.name,
        category_colour=txn.category.colour,
        category_icon=txn.category.icon,
        amount=txn.amount,
        pending=txn.pending,
        user_overrode_category=txn.user_overrode_category,
        affects_budget=txn.category.name not in NON_EXPENSE_CATEGORIES,
    )


def account_out(account: BankAccount) -> AccountOut:
    item = account.plaid_item
    return AccountOut(
        id=account.id,
        account_name=account.account_name,
        official_name=account.official_name,
        account_type=account.account_type,
        account_subtype=account.account_subtype,
        current_balance=account.current_balance,
        available_balance=account.available_balance,
        currency=account.currency,
        institution_name=item.institution_name,
        connection_status=item.status,
        last_synced_at=item.last_synced_at,
    )
