"""JWT helpers shared by all YapZee services."""

from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from yapzee_common.config import JWT_ALGORITHM, JWT_SECRET, JWT_TTL_DAYS


def require_jwt_secret() -> None:
    """Fail fast for services that need JWT auth. Call at service startup."""
    if not JWT_SECRET:
        raise RuntimeError("YAPZEE_JWT_SECRET env var is required")


def create_token(user_id: str) -> str:
    require_jwt_secret()
    now = datetime.now(UTC)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_TTL_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> str | None:
    """Return user_id (sub) if token is valid, else None."""
    require_jwt_secret()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None
