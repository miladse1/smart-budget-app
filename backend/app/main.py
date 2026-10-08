"""BudgetFlow API. Read-only budgeting. This service never moves money."""

import logging
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import configuration_problems, cors_origins, settings
from app.database import SessionLocal
from app.logging_utils import configure_logging, request_id_var
from app.routers.api import router
from app.services.users import get_local_user, seed_categories

logger = logging.getLogger("budgetflow")

# JSON bodies in this API are tiny. Plaid webhooks are well under this limit too.
MAX_BODY_BYTES = 64 * 1024


class ConfigurationError(RuntimeError):
    """Startup refused. The message lists variable names only."""


def check_configuration() -> None:
    problems = configuration_problems(settings)
    if problems:
        for problem in problems:
            logger.error("Configuration problem: %s", problem)
        raise ConfigurationError("BudgetFlow will not start until the configuration problems above are fixed.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    check_configuration()
    logger.info(
        "Starting app_env=%s plaid_env=%s plaid_configured=%s encryption_configured=%s",
        settings.app_env,
        settings.plaid_environment,
        settings.plaid_configured,
        settings.encryption_configured,
    )
    if os.getenv("BUDGETFLOW_SKIP_STARTUP") == "1":
        yield
        return
    db = SessionLocal()
    try:
        seed_categories(db)
        get_local_user(db)
        db.commit()
    except Exception:
        # The exception text can include the database host; it is not needed to act on this.
        logger.warning("Database is not ready. Run Alembic migrations, then start the API again.")
        db.rollback()
    finally:
        db.close()
    yield


class BodySizeLimit:
    """Reject request bodies over MAX_BODY_BYTES, with or without a Content-Length header."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length")
        if declared is not None:
            try:
                too_big = int(declared) > self.max_bytes
            except ValueError:
                too_big = True
            if too_big:
                await _send_json(send, 413, {"detail": "Request body is too large."})
                return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _BodyTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _BodyTooLarge:
            await _send_json(send, 413, {"detail": "Request body is too large."})


class _BodyTooLarge(Exception):
    pass


async def _send_json(send: Send, status: int, body: dict) -> None:
    import json

    payload = json.dumps(body).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())],
        }
    )
    await send({"type": "http.response.body", "body": payload})


docs_enabled = not settings.is_production
app = FastAPI(
    title="BudgetFlow API",
    version="0.1.0",
    description=(
        "Personal budgeting API. BudgetFlow reads transactions and calculates budgets. "
        "It never transfers, withdraws, or moves money."
    ),
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    # A random ID per request ties log lines to a user-visible error reference.
    request_id = uuid.uuid4().hex[:16]
    token = request_id_var.set(request_id)
    try:
        response = await call_next(request)
    except Exception as exc:
        # Log the type and a redacted traceback; the client only sees a reference it can quote.
        logger.error("Unhandled %s", type(exc).__name__, exc_info=exc)
        response = JSONResponse(
            status_code=500,
            content={"detail": f"Something went wrong. Please try again. Reference {request_id}."},
        )
    finally:
        request_id_var.reset(token)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    if not request.url.path.startswith(_DOCS_PATHS):
        # API responses are JSON and are never rendered or framed.
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if request.url.path.startswith("/api"):
        # Financial data must not sit in shared or browser caches.
        response.headers["Cache-Control"] = "no-store"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
    max_age=600,
)
app.add_middleware(BodySizeLimit)
app.include_router(router)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # Pydantic's default response echoes the submitted input, which could be a token. Send field names only.
    fields = sorted({".".join(str(part) for part in error.get("loc", ())[1:]) or "body" for error in exc.errors()})
    first = exc.errors()[0].get("msg", "Invalid value.") if exc.errors() else "Invalid value."
    return JSONResponse(
        status_code=422,
        content={"detail": [{"msg": f"{first} ({', '.join(fields)})" if fields else first, "fields": fields}]},
    )


@app.exception_handler(Exception)
async def unhandled_error(_request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "Request could not be completed."
        return JSONResponse(status_code=exc.status_code, content={"detail": detail}, headers=exc.headers)
    reference = request_id_var.get()
    logger.error("Unhandled %s", type(exc).__name__, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Something went wrong. Please try again. Reference {reference}."},
    )
