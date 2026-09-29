"""Pytest fixtures. Tests use an in-memory database and do not call Plaid."""

import os

os.environ["BUDGETFLOW_SKIP_STARTUP"] = "1"

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.services.users import seed_categories


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
        yield test_client
    app.dependency_overrides.clear()
