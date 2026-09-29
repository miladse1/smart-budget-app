"""Initial BudgetFlow tables and default categories."""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.category_data import DEFAULT_CATEGORIES

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("budget_start_day", sa.Integer(), nullable=False),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("colour", sa.String(length=7), nullable=False),
        sa.Column("icon", sa.String(length=40), nullable=False),
        sa.Column("plaid_category_mapping", sa.JSON(), nullable=False),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "plaid_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("institution_name", sa.String(length=255), nullable=False),
        sa.Column("encrypted_access_token", sa.Text(), nullable=True),
        sa.Column("plaid_item_id", sa.String(length=128), nullable=False),
        sa.Column("transaction_cursor", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("plaid_item_id"),
    )
    op.create_index("ix_plaid_items_user_id", "plaid_items", ["user_id"])
    op.create_table(
        "bank_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plaid_item_id", sa.Integer(), sa.ForeignKey("plaid_items.id"), nullable=False),
        sa.Column("plaid_account_id", sa.String(length=128), nullable=False),
        sa.Column("account_name", sa.String(length=255), nullable=False),
        sa.Column("official_name", sa.String(length=255), nullable=True),
        sa.Column("account_type", sa.String(length=64), nullable=False),
        sa.Column("account_subtype", sa.String(length=64), nullable=True),
        sa.Column("current_balance", sa.Numeric(14, 2), nullable=True),
        sa.Column("available_balance", sa.Numeric(14, 2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("plaid_account_id"),
    )
    op.create_index("ix_bank_accounts_plaid_item_id", "bank_accounts", ["plaid_item_id"])
    op.create_table(
        "budgets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("limit_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "category_id", "month", "year", name="uq_budget_category_month"),
    )
    op.create_index("ix_budgets_user_id", "budgets", ["user_id"])
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("bank_account_id", sa.Integer(), sa.ForeignKey("bank_accounts.id"), nullable=False),
        sa.Column("plaid_transaction_id", sa.String(length=128), nullable=False),
        sa.Column("merchant_name", sa.String(length=500), nullable=False),
        sa.Column("original_name", sa.String(length=500), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("pending", sa.Boolean(), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("plaid_primary_category", sa.String(length=120), nullable=True),
        sa.Column("plaid_detailed_category", sa.String(length=160), nullable=True),
        sa.Column("pending_plaid_transaction_id", sa.String(length=128), nullable=True),
        sa.Column("user_overrode_category", sa.Boolean(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "plaid_transaction_id", name="uq_user_plaid_transaction"),
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_bank_account_id", "transactions", ["bank_account_id"])
    op.create_index("ix_transactions_transaction_date", "transactions", ["transaction_date"])

    bind = op.get_bind()
    for category in DEFAULT_CATEGORIES:
        bind.execute(
            sa.text(
                """
                INSERT INTO categories (name, colour, icon, plaid_category_mapping)
                VALUES (:name, :colour, :icon, CAST(:mapping AS json))
                ON CONFLICT (name) DO NOTHING
                """
            ),
            {
                "name": category["name"],
                "colour": category["colour"],
                "icon": category["icon"],
                "mapping": json.dumps(category["plaid_category_mapping"]),
            },
        )


def downgrade() -> None:
    op.drop_index("ix_transactions_transaction_date", table_name="transactions")
    op.drop_index("ix_transactions_bank_account_id", table_name="transactions")
    op.drop_index("ix_transactions_user_id", table_name="transactions")
    op.drop_table("transactions")
    op.drop_index("ix_budgets_user_id", table_name="budgets")
    op.drop_table("budgets")
    op.drop_index("ix_bank_accounts_plaid_item_id", table_name="bank_accounts")
    op.drop_table("bank_accounts")
    op.drop_index("ix_plaid_items_user_id", table_name="plaid_items")
    op.drop_table("plaid_items")
    op.drop_table("categories")
    op.drop_table("user_preferences")
    op.drop_table("users")
