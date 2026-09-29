"""Shared FastAPI dependencies."""

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services.users import get_local_user, seed_categories


def current_user(db: Session = Depends(get_db)) -> User:
    # One local profile until a login system is added.
    seed_categories(db)
    db.commit()
    return get_local_user(db)
