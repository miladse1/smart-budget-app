"""Database tables.

Spent amounts are not stored on budgets. They are calculated from transactions
so a category change updates every affected budget on the next read.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates
from sqlalchemy.types import JSON

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    preference: Mapped["UserPreference | None"] = relationship(back_populates="user", uselist=False)
    plaid_items: Mapped[list["PlaidItem"]] = relationship(back_populates="user")
    budgets: Mapped[list["Budget"]] = relationship(back_populates="user")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user")


class UserPreference(Base):
    """Currency and budget calendar for the single local user. Auth can reuse this later."""

    __tablename__ = "user_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="CAD", nullable=False)
    budget_start_day: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    goal: Mapped[str | None] = mapped_column(String(16), nullable=True)

    user: Mapped[User] = relationship(back_populates="preference")


class PlaidItem(Base):
    __tablename__ = "plaid_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    institution_name: Mapped[str] = mapped_column(String(255), nullable=False)
    encrypted_access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    plaid_item_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    transaction_cursor: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="plaid_items")
    accounts: Mapped[list["BankAccount"]] = relationship(back_populates="plaid_item")

    @validates("encrypted_access_token")
    def _only_ciphertext(self, _key: str, value: str | None) -> str | None:
        """Refuse to persist anything that is not Fernet ciphertext, such as a raw access token."""
        from app.crypto import looks_encrypted

        if value is not None and not looks_encrypted(value):
            raise ValueError("Plaid access tokens must be encrypted before they are stored.")
        return value

    def __repr__(self) -> str:
        # Never include the token or Plaid's item identifier in debug output.
        return f"PlaidItem(id={self.id}, status={self.status!r}, is_demo={self.is_demo})"


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plaid_item_id: Mapped[int] = mapped_column(ForeignKey("plaid_items.id"), nullable=False, index=True)
    plaid_account_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    account_name: Mapped[str] = mapped_column(String(255), nullable=False)
    official_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_type: Mapped[str] = mapped_column(String(64), nullable=False)
    account_subtype: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    available_balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="CAD", nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    plaid_item: Mapped[PlaidItem] = relationship(back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="bank_account")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    colour: Mapped[str] = mapped_column(String(7), nullable=False)
    icon: Mapped[str] = mapped_column(String(40), nullable=False)
    plaid_category_mapping: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    budgets: Mapped[list["Budget"]] = relationship(back_populates="category")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="category")


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "category_id", "month", "year", name="uq_budget_category_month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="budgets")
    category: Mapped[Category] = relationship(back_populates="budgets")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("user_id", "plaid_transaction_id", name="uq_user_plaid_transaction"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    bank_account_id: Mapped[int] = mapped_column(ForeignKey("bank_accounts.id"), nullable=False, index=True)
    plaid_transaction_id: Mapped[str] = mapped_column(String(128), nullable=False)
    merchant_name: Mapped[str] = mapped_column(String(500), nullable=False)
    original_name: Mapped[str] = mapped_column(String(500), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    pending: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    plaid_primary_category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    plaid_detailed_category: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Set on the posted transaction. Points at the pending id it replaced.
    pending_plaid_transaction_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    user_overrode_category: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="transactions")
    bank_account: Mapped[BankAccount] = relationship(back_populates="transactions")
    category: Mapped[Category] = relationship(back_populates="transactions")
