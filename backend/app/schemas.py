"""API request and response shapes. Money is serialized as a decimal string."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

from app.money import money


def _money_json(value: Decimal) -> str:
    return f"{money(value):.2f}"


Money = Annotated[Decimal, PlainSerializer(_money_json, return_type=str, when_used="json")]


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class AppInfo(APIModel):
    name: str
    user_name: str
    plaid_env: str
    plaid_configured: bool
    currency: str
    budget_start_day: int
    month: int
    year: int
    demo_loaded: bool


class CategoryOut(APIModel):
    id: int
    name: str
    colour: str
    icon: str


class BudgetOut(APIModel):
    id: int
    category_id: int
    name: str
    colour: str
    icon: str
    month: int
    year: int
    limit_amount: Money
    spent: Money
    remaining: Money
    percent: int
    status: str
    over_amount: Money


class BudgetCreate(BaseModel):
    category_id: int
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=2100)
    limit_amount: Decimal = Field(gt=0, le=Decimal("100000000"))


class BudgetUpdate(BaseModel):
    limit_amount: Decimal = Field(gt=0, le=Decimal("100000000"))


class CopyBudgetsRequest(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=2100)


class CopyBudgetsResult(APIModel):
    copied: int
    message: str


class TransactionOut(APIModel):
    id: int
    transaction_date: date
    merchant_name: str
    original_name: str
    account_id: int
    account_name: str
    category_id: int
    category_name: str
    category_colour: str
    category_icon: str
    amount: Money
    pending: bool
    user_overrode_category: bool
    affects_budget: bool


class TransactionPage(APIModel):
    items: list[TransactionOut]
    page: int
    page_size: int
    total: int


class CategoryChange(BaseModel):
    category_id: int


class AccountOut(APIModel):
    id: int
    account_name: str
    official_name: str | None
    account_type: str
    account_subtype: str | None
    current_balance: Money | None
    available_balance: Money | None
    currency: str
    institution_name: str
    connection_status: str
    last_synced_at: datetime | None = None


class ItemOut(APIModel):
    id: int
    institution_name: str
    status: str
    last_synced_at: datetime | None
    is_demo: bool
    accounts: list[AccountOut]


class LinkTokenOut(APIModel):
    link_token: str
    expiration: str | None = None


class ExchangeIn(BaseModel):
    public_token: str = Field(min_length=8, max_length=500)
    institution_name: str | None = Field(default=None, max_length=255)


class SyncResult(APIModel):
    synced_items: int
    added: int
    modified: int
    removed: int
    message: str


class SettingsOut(APIModel):
    user_name: str
    email: str
    currency: str
    budget_start_day: int
    plaid_env: str
    plaid_configured: bool
    demo_loaded: bool


class SettingsUpdate(BaseModel):
    currency: str = Field(pattern="^(CAD|USD|EUR|GBP)$")
    budget_start_day: int = Field(ge=1, le=28)


class DemoResult(APIModel):
    message: str
    month: int | None = None
    year: int | None = None
    transactions: int = 0
    budgets: int = 0


class DashboardSummary(APIModel):
    remaining: Money
    spent: Money
    income: Money
    total_budget: Money


class SpendingSlice(APIModel):
    name: str
    colour: str
    spent: Money


class OverspendOut(APIModel):
    name: str
    colour: str
    over_amount: Money


class DashboardOut(APIModel):
    month: int
    year: int
    period_start: date
    period_end: date
    currency: str
    last_synced_at: datetime | None
    summary: DashboardSummary
    budgets: list[BudgetOut]
    budget_count: int
    spending_by_category: list[SpendingSlice]
    overspending: list[OverspendOut]
    recent_transactions: list[TransactionOut]
    accounts: list[AccountOut]
    insight: str
