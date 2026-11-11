"""Shared FastAPI dependencies."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, session_for
from app.config import settings
from app.database import get_db
from app.models import User
from app.services.users import ensure_preference, seed_categories


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """The signed-in owner. Every endpoint with financial data depends on this."""
    session = session_for(db, request.cookies.get(SESSION_COOKIE), settings)
    if session is None:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    seed_categories(db)
    user = ensure_preference(db, session.user)
    db.commit()
    return user
