"""BudgetFlow API. Read-only budgeting. This service never moves money."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import cors_origins, settings
from app.database import SessionLocal
from app.routers.api import router
from app.services.users import get_local_user, seed_categories

logger = logging.getLogger("budgetflow")


class SecretRedactionFilter(logging.Filter):
    """Last line of defence so tokens and secrets are not written to logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        redacted = message
        for secret in (settings.plaid_secret, settings.app_encryption_key, settings.plaid_client_id):
            if secret and secret in redacted:
                redacted = redacted.replace(secret, "[redacted]")
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    redactor = SecretRedactionFilter()
    logging.getLogger().addFilter(redactor)
    if settings.encryption_configured:
        logger.info("Encryption key loaded")
    else:
        logger.info("APP_ENCRYPTION_KEY is not set. Bank connections stay disabled.")
    logger.info("Plaid environment=%s configured=%s", settings.plaid_env, settings.plaid_configured)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    if os.getenv("BUDGETFLOW_SKIP_STARTUP") == "1":
        yield
        return
    db = SessionLocal()
    try:
        seed_categories(db)
        get_local_user(db)
        db.commit()
    except Exception:
        logger.warning("Database is not ready. Run Alembic migrations, then start the API again.")
        db.rollback()
    finally:
        db.close()
    yield


app = FastAPI(
    title="BudgetFlow API",
    version="0.1.0",
    description=(
        "Personal budgeting API. BudgetFlow reads transactions and calculates budgets. "
        "It never transfers, withdraws, or moves money."
    ),
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Plaid-Verification"],
)
app.include_router(router)


@app.exception_handler(Exception)
async def unhandled_error(_request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "Request could not be completed."
        return JSONResponse(status_code=exc.status_code, content={"detail": detail})
    logger.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again."})
