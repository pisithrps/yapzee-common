"""Internal-only endpoint auth shared by all YapZee services.

Gates service-to-service endpoints behind a shared secret header so the
gateway can strip it from public traffic while internal callers (other
services) still pass it explicitly.
"""

import os

from fastapi import Header, HTTPException


def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    """FastAPI dependency for internal-only endpoints.

    Reads `INTERNAL_API_KEY` from the environment on every call (not cached
    at import time) and compares it against the `X-Internal-Key` header.
    Raises 500 if the env var isn't configured, 403 on any mismatch
    (including a missing header), and passes silently on a match.
    """
    expected = os.getenv("INTERNAL_API_KEY")
    if not expected:
        raise HTTPException(status_code=500, detail="INTERNAL_API_KEY is not configured")
    if x_internal_key != expected:
        raise HTTPException(status_code=403, detail="Invalid or missing X-Internal-Key header")
