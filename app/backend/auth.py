"""The signed-in caller: every protected route depends on get_current_user."""

from typing import Optional

from fastapi import Header, HTTPException
from supabase_auth.errors import AuthError, AuthRetryableError

from errors import ApiError, logger
from supabase_client import supabase, user_client


# Optional so a missing header is a 401, not FastAPI's default 422.
def get_current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        user_response = supabase.auth.get_user(token)
    except AuthError as exc:
        # A 4xx from Supabase Auth means the token was rejected. Anything else
        # (gateway errors, rate limits, 5xx) means Auth itself is struggling.
        # Unreachable or timed out raises httpx.TransportError, which the
        # shared handler already turns into a 503.
        status = getattr(exc, "status", None)
        if not isinstance(exc, AuthRetryableError) and status and 400 <= status < 500 and status != 429:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        logger.error("Supabase Auth unavailable: %s %s", type(exc).__name__, status)
        raise ApiError(503, "Sign-in service temporarily unavailable. Try again shortly.")

    if not user_response or not user_response.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return {"user": user_response.user, "client": user_client(token)}
