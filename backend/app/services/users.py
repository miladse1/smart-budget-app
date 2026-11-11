"""Local profile helpers.

This version has one user. A future login system can replace get_local_user
without changing budgets or transactions.
"""

from sqlalchemy.orm import Session

from app.category_data import DEFAULT_CATEGORIES
from app.models import Category, User, UserPreference, utcnow

LOCAL_USER_EMAIL = "demo@budgetflow.local"
LOCAL_USER_NAME = "Demo User"


def seed_categories(db: Session) -> None:
    for item in DEFAULT_CATEGORIES:
        row = db.query(Category).filter(Category.name == item["name"]).one_or_none()
        if row is None:
            db.add(Category(**item))
        else:
            row.colour = item["colour"]
            row.icon = item["icon"]
            row.plaid_category_mapping = item["plaid_category_mapping"]
    db.flush()


def get_local_user(db: Session) -> User:
    """The owner's profile row. All budgets, accounts, and transactions belong to it."""
    user = db.query(User).filter(User.email == LOCAL_USER_EMAIL).one_or_none()
    created = False
    if user is None:
        user = User(name=LOCAL_USER_NAME, email=LOCAL_USER_EMAIL, created_at=utcnow())
        db.add(user)
        db.flush()
        created = True
    if user.preference is None:
        db.add(UserPreference(user_id=user.id, currency="CAD", budget_start_day=1))
        created = True
    if created:
        db.commit()
        db.refresh(user)
    return user


def ensure_preference(db: Session, user: User) -> User:
    if user.preference is None:
        db.add(UserPreference(user_id=user.id, currency="CAD", budget_start_day=1))
        db.flush()
        db.refresh(user)
    return user


def category_by_name(db: Session, name: str) -> Category:
    row = db.query(Category).filter(Category.name == name).one_or_none()
    if row is None:
        seed_categories(db)
        row = db.query(Category).filter(Category.name == name).one()
    return row


def resolve_plaid_category(db: Session, primary: str | None, detailed: str | None) -> Category:
    categories = db.query(Category).all()
    by_key: dict[str, Category] = {}
    for category in categories:
        for key in category.plaid_category_mapping or []:
            by_key[str(key)] = category
    if detailed and detailed in by_key:
        return by_key[detailed]
    if primary and primary in by_key:
        return by_key[primary]
    return category_by_name(db, "Other")
