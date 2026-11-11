"""Pytest fixtures. Tests use an in-memory database and do not call Plaid."""

import os

os.environ["BUDGETFLOW_SKIP_STARTUP"] = "1"
# Environment variables take precedence over the .env file, so tests never see real
# credentials even when a developer's .env has them. Tests set fake values themselves.
os.environ.update(
    {
        "APP_ENV": "development",
        "PLAID_ENV": "sandbox",
        "PLAID_CLIENT_ID": "",
        "PLAID_SECRET": "",
        "PLAID_WEBHOOK_URL": "",
        "APP_ENCRYPTION_KEY": "",
        "DATABASE_URL": "sqlite://",
        "FRONTEND_URL": "http://localhost:5173",
        "ALLOWED_HOSTS": "testserver,localhost,127.0.0.1",
    }
)

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.services.users import seed_categories

OWNER_PASSPHRASE = "correct horse battery staple"


@pytest.fixture(autouse=True)
def _fresh_limits() -> Generator[None, None, None]:
    from app.ratelimit import reset
    from app.services.plaid_service import clear_webhook_key_cache

    reset()
    clear_webhook_key_cache()
    yield
    reset()
    clear_webhook_key_cache()


@pytest.fixture()
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = session_factory()
    seed_categories(session)
    session.commit()
    session.info["factory"] = session_factory
    yield session
    session.close()


@pytest.fixture()
def client(db: Session) -> Generator[TestClient, None, None]:
    session_factory = db.info["factory"]

    def override() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as test_client:
        # Every API test runs as the signed-in owner; test_auth.py covers signed-out access.
        response = test_client.post("/api/auth/setup", json={"passphrase": OWNER_PASSPHRASE})
        assert response.status_code == 201, response.text
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def anon_client(db: Session) -> Generator[TestClient, None, None]:
    """A client with no session and no owner passphrase yet (first run)."""
    session_factory = db.info["factory"]

    def override() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
