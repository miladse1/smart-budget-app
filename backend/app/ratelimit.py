"""Small in-memory rate limiter for sensitive endpoints.

Fixed-window counters per client address and bucket. This protects a single API process;
a deployment with several processes or hosts needs a shared store such as Redis instead.
"""

import threading
import time
from collections.abc import Callable

from fastapi import HTTPException, Request

_lock = threading.Lock()
_hits: dict[tuple[str, str], tuple[float, int]] = {}


def reset() -> None:
    with _lock:
        _hits.clear()


def _client_key(request: Request) -> str:
    # The direct peer address. Behind a proxy, configure the proxy's trusted forwarding instead
    # of reading X-Forwarded-For here, which a client could forge.
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, limit: int, window_seconds: int) -> Callable[[Request], None]:
    """FastAPI dependency: allow `limit` requests per `window_seconds` per client for a bucket."""

    def dependency(request: Request) -> None:
        now = time.monotonic()
        key = (_client_key(request), bucket)
        with _lock:
            started, count = _hits.get(key, (now, 0))
            if now - started >= window_seconds:
                started, count = now, 0
            count += 1
            _hits[key] = (started, count)
            retry_after = max(1, int(window_seconds - (now - started)))
        if count > limit:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment and try again.",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency
