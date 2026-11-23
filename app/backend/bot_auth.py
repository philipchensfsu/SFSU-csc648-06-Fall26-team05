"""Feature 04: requests from the Discord bot, run as the person who linked
their Discord account.

The bot sends two headers: X-Bot-Secret (shared only by the bot and this
backend) and X-Discord-User-Id (who ran the command). get_bot_user checks
the secret, finds the linked account and signs a short-lived token for it,
so every query runs through RLS exactly as if that person were signed in.
The token never leaves the backend: the bot gets answers, not access.

Signing needs the project's legacy JWT secret (HS256). The hosted project
signs sign-ins with an ECC key but still accepts HS256 tokens (checked
2026-11-18); if the legacy key is ever revoked, bot requests start failing
with 401 from the database.
"""

import hmac
import os
import re
import time
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import Header, HTTPException
from supabase_auth.errors import AuthApiError

from errors import ApiError
from supabase_client import supabase, user_client

SNOWFLAKE = re.compile(r"^[1-9][0-9]{16,19}$")
TOKEN_SECONDS = 300


def check_bot_secret(x_bot_secret: Optional[str] = Header(default=None)) -> None:
    """Only the bot knows the secret. Compared in constant time."""
    expected = os.environ.get("BOT_API_SECRET")
    if not expected or not os.environ.get("SUPABASE_JWT_SECRET"):
        raise ApiError(
            503,
            "The Discord bot isn't set up on this server.",
            code="bot_not_configured",
        )
    if not x_bot_secret or not hmac.compare_digest(
        x_bot_secret.encode(), expected.encode()
    ):
        raise HTTPException(status_code=401, detail="Invalid bot secret")


def discord_user_id(x_discord_user_id: Optional[str] = Header(default=None)) -> str:
    """Read and check the Discord user id the bot sends in the X-Discord-User-Id header.

    Raises:
        ApiError: 422 if the header is missing or not a Discord id.
    """
    if not x_discord_user_id or not SNOWFLAKE.match(x_discord_user_id):
        raise ApiError(
            422,
            "X-Discord-User-Id must be a Discord user id.",
            code="invalid_discord_user",
        )
    return x_discord_user_id


def get_bot_user(
    x_bot_secret: Optional[str] = Header(default=None),
    x_discord_user_id: Optional[str] = Header(default=None),
):
    """The linked person, in the same shape as get_current_user."""
    check_bot_secret(x_bot_secret)
    discord_id = discord_user_id(x_discord_user_id)
    # The service client only finds who is linked; everything after runs as them.
    rows = (
        supabase.table("discord_link")
        .select("profile_id")
        .eq("discord_user_id", discord_id)
        .execute()
        .data
    )
    if not rows:
        raise not_linked()
    # A signed token skips Supabase Auth, so check what Auth would: the
    # account still exists and isn't banned. (Deleting an account removes
    # its link; leaving an organization is handled by RLS.)
    try:
        user = supabase.auth.admin.get_user_by_id(rows[0]["profile_id"]).user
    except AuthApiError as exc:
        if exc.status == 404:
            raise not_linked()
        raise
    if user is None or banned(user):
        raise not_linked()
    return {"user": user, "client": user_client(sign_token(user.id))}


def sign_token(user_id: str) -> str:
    """Sign a short-lived Supabase access token for a linked user, so the bot acts as them."""
    now = int(time.time())
    claims = {
        "sub": str(user_id),
        "role": "authenticated",
        "aud": "authenticated",
        "iat": now,
        "exp": now + TOKEN_SECONDS,
    }
    return jwt.encode(claims, os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256")


def banned(user) -> bool:
    """Return True if the user's account is currently banned."""
    until = getattr(user, "banned_until", None)
    if not until:
        return False
    if isinstance(until, str):
        until = datetime.fromisoformat(until.replace("Z", "+00:00"))
    return until > datetime.now(timezone.utc)


def not_linked() -> ApiError:
    """Return the error for a Discord account that is not linked to Nautilus."""
    return ApiError(
        403,
        "This Discord account isn't linked to Nautilus. Run /link with a code from your Nautilus "
        "settings.",
        code="discord_not_linked",
    )
