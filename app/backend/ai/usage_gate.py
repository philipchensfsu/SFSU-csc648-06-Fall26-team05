"""Per-user AI usage gate (Backend Tasks A07).

Every AI route wraps its provider work in admitted():

    with usage_gate.admitted(user_client(token)):
        proposal = generate_proposal(inputs)   # retries happen inside

Before any Gemini call this checks the global off switch, then asks the
database (ai_admit) for admission: a cooldown between a user's requests and
one active request per user, held as a lease that expires. The lease is
released when the block ends, even on error. Refusals are 429s with the S01
codes the frontend guide lists: ai_disabled, ai_cooldown and ai_busy (the
last two carry retry_after). Manual editing never goes through here.

State lives in the shared ai_usage_gate table, not in process memory, because
Vercel's serverless instances don't share memory. Pass the user's own client:
the database acts for auth.uid(). Not wired into any route yet.
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager

from ai.gemini_client import TIMEOUT_SECONDS, AIError, MAX_ATTEMPTS, RETRY_DELAY_SECONDS, ai_enabled
from errors import ApiError

# Provisional limits, not team-agreed (A07 leaves the values to the AI team).
# Override with AI_COOLDOWN_SECONDS / AI_LEASE_SECONDS.
DEFAULT_COOLDOWN_SECONDS = 10
# Longer than one admitted request can take: every attempt at the full
# timeout plus the retry delay, with margin. A crashed request frees the user
# after this long.
DEFAULT_LEASE_SECONDS = int(MAX_ATTEMPTS * TIMEOUT_SECONDS + RETRY_DELAY_SECONDS) + 60

MESSAGES = {
    "ai_cooldown": "Please wait a moment before asking the AI again.",
    "ai_busy": "Your previous AI request is still running. Wait for it to finish.",
}

logger = logging.getLogger("nautilus.ai")


class UsageLimitError(ApiError):
    """A 429 the S01 handler renders as {detail, code, retry_after}, with a
    Retry-After header."""

    def __init__(self, code: str, retry_after: int):
        super().__init__(429, MESSAGES[code], code)
        self.headers = {"Retry-After": str(retry_after)}
        self.extra = {"retry_after": retry_after}


def cooldown_seconds() -> int:
    return _setting("AI_COOLDOWN_SECONDS", DEFAULT_COOLDOWN_SECONDS, 0, 3600)


def lease_seconds() -> int:
    return _setting("AI_LEASE_SECONDS", DEFAULT_LEASE_SECONDS, 10, 3600)


def _setting(name: str, default: int, low: int, high: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        logger.error("%s isn't a whole number; using %s", name, default)
        return default
    if not low <= value <= high:
        logger.error("%s is outside %s-%s; using %s", name, low, high, default)
        return default
    return value


@contextmanager
def admitted(user_client):
    """Admits one AI request for the caller, or raises a 429."""
    if not ai_enabled():
        raise AIError(429, "ai_disabled")
    rows = user_client.rpc("ai_admit", {
        "p_cooldown_seconds": cooldown_seconds(),
        "p_lease_seconds": lease_seconds(),
    }).execute().data
    row = rows[0]
    if row["lease_id"] is None:
        code = "ai_busy" if row["refused"] == "busy" else "ai_cooldown"
        raise UsageLimitError(code, row["retry_after"])
    lease_id = row["lease_id"]
    try:
        yield lease_id
    finally:
        try:
            released = user_client.rpc("ai_release", {"p_lease_id": lease_id}).execute().data
            if released is False:
                # The lease ran out and a newer request took over; nothing to free.
                logger.warning("AI lease had already expired when released")
        except Exception as exc:  # noqa: BLE001 - the lease expires on its own
            logger.error("Couldn't release the AI lease (%s); it expires on its own", type(exc).__name__)
