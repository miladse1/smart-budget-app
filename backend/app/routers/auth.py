"""Owner sign-in endpoints. Passphrases are never logged or echoed back."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    MAX_PASSPHRASE,
    MIN_PASSPHRASE,
    SESSION_COOKIE,
    create_session,
    hash_passphrase,
    hash_token,
    revoke_sessions,
    session_for,
    verify_passphrase,
)
from app.config import settings
from app.database import get_db
from app.deps import current_user
from app.models import AuthSession, User, utcnow
from app.ratelimit import rate_limit
from app.services.users import get_local_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Per client address. Sign-in allows a few typos, then makes guessing slow.
setup_limit = Depends(rate_limit("auth-setup", limit=5, window_seconds=300))
login_limit = Depends(rate_limit("auth-login", limit=8, window_seconds=300))
change_limit = Depends(rate_limit("auth-change", limit=5, window_seconds=300))


class SetupIn(BaseModel):
    passphrase: str = Field(min_length=MIN_PASSPHRASE, max_length=MAX_PASSPHRASE)


class LoginIn(BaseModel):
    passphrase: str = Field(min_length=1, max_length=MAX_PASSPHRASE)


class ChangeIn(BaseModel):
    current_passphrase: str = Field(min_length=1, max_length=MAX_PASSPHRASE)
    new_passphrase: str = Field(min_length=MIN_PASSPHRASE, max_length=MAX_PASSPHRASE)


class AuthStatus(BaseModel):
    owner_set: bool
    signed_in: bool


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_hours * 3600,
        path="/api",
        httponly=True,
        samesite="strict",
        secure=settings.is_production,
    )


def _clear_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/api", httponly=True, samesite="strict", secure=settings.is_production)


@router.get("/status", response_model=AuthStatus)
def status(request: Request, db: Session = Depends(get_db)) -> AuthStatus:
    owner = get_local_user(db)
    return AuthStatus(
        owner_set=owner.password_hash is not None,
        signed_in=session_for(db, request.cookies.get(SESSION_COOKIE), settings) is not None,
    )


@router.post("/setup", response_model=AuthStatus, status_code=201, dependencies=[setup_limit])
def setup(payload: SetupIn, response: Response, db: Session = Depends(get_db)) -> AuthStatus:
    """First run only: create the owner's passphrase. Existing budgets and accounts are kept."""
    owner = get_local_user(db)
    if owner.password_hash is not None:
        raise HTTPException(status_code=409, detail="A passphrase already exists. Sign in instead.")
    owner.password_hash = hash_passphrase(payload.passphrase)
    token = create_session(db, owner, settings)
    db.commit()
    _set_cookie(response, token)
    return AuthStatus(owner_set=True, signed_in=True)


@router.post("/login", response_model=AuthStatus, dependencies=[login_limit])
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)) -> AuthStatus:
    owner = get_local_user(db)
    if not verify_passphrase(payload.passphrase, owner.password_hash):
        raise HTTPException(status_code=401, detail="That passphrase is not correct.")
    token = create_session(db, owner, settings)
    db.commit()
    _set_cookie(response, token)
    return AuthStatus(owner_set=True, signed_in=True)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        row = db.query(AuthSession).filter(AuthSession.token_hash == hash_token(token)).one_or_none()
        if row is not None and row.revoked_at is None:
            row.revoked_at = utcnow()
            db.commit()
    _clear_cookie(response)


@router.post("/change-passphrase", response_model=AuthStatus, dependencies=[change_limit])
def change_passphrase(
    payload: ChangeIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> AuthStatus:
    if not verify_passphrase(payload.current_passphrase, user.password_hash):
        raise HTTPException(status_code=401, detail="The current passphrase is not correct.")
    user.password_hash = hash_passphrase(payload.new_passphrase)
    # Every other browser is signed out; this one stays signed in.
    revoke_sessions(db, user, keep_token=request.cookies.get(SESSION_COOKIE))
    db.commit()
    return AuthStatus(owner_set=True, signed_in=True)
