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
the database acts for auth.uid(). Used by the generation preview and the PRD
chat; the chat also enforces RequestBudget on its provider calls.
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager

from ai.gemini_client import TIMEOUT_SECONDS, AIError, MAX_ATTEMPTS, RETRY_DELAY_SECONDS, ai_enabled
from errors import ApiError

# Provisional limits, not team-agreed (A07 leaves the values to the AI team).
# Each can be overridden with the environment variable of the same name.
DEFAULT_COOLDOWN_SECONDS = 10

# Time limits for one AI request (Marco, 2026-10-30). Vercel stops our
# function at 300 s (Fluid Compute default, checked read-only), so the whole
# request, including every provider attempt, retry delay, database work and
# cleanup, gets a budget below that. RequestBudget enforces it on provider
# calls; database and cleanup work gets CLEANUP_ALLOWANCE_SECONDS.
DEFAULT_SCOPE_TIMEOUT_SECONDS = 10  # per attempt, for the chat scope check
DEFAULT_MAIN_TIMEOUT_SECONDS = TIMEOUT_SECONDS  # per attempt, for the main call
DEFAULT_REQUEST_BUDGET_SECONDS = 170
CLEANUP_ALLOWANCE_SECONDS = 20
MIN_CALL_TIMEOUT_SECONDS = 5  # less than this isn't worth starting a call
# The lease outlasts the budget, so a request still inside its budget never
# loses it. A crashed request frees the user after this long. A longer lease
# doesn't give the function more time.
LEASE_MARGIN_SECONDS = 30
DEFAULT_LEASE_SECONDS = DEFAULT_REQUEST_BUDGET_SECONDS + LEASE_MARGIN_SECONDS

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


def request_budget_seconds() -> int:
    return _setting("AI_REQUEST_BUDGET_SECONDS", DEFAULT_REQUEST_BUDGET_SECONDS, 30, 270)


def scope_timeout_seconds() -> int:
    return _setting("AI_SCOPE_TIMEOUT_SECONDS", DEFAULT_SCOPE_TIMEOUT_SECONDS, 1, 60)


def main_timeout_seconds() -> int:
    return _setting("AI_MAIN_TIMEOUT_SECONDS", DEFAULT_MAIN_TIMEOUT_SECONDS, 5, 120)


def lease_seconds() -> int:
    budget = request_budget_seconds()
    lease = _setting("AI_LEASE_SECONDS", budget + LEASE_MARGIN_SECONDS, 10, 3600)
    if lease <= budget:
        logger.error("AI_LEASE_SECONDS must outlast AI_REQUEST_BUDGET_SECONDS; using %s", budget + LEASE_MARGIN_SECONDS)
        return budget + LEASE_MARGIN_SECONDS
    return lease


class RequestBudget:
    """The wall-clock budget of one AI request, counted from when the route
    starts it. Each provider call asks call_timeout() for its per-attempt
    timeout, so every attempt and the retry delay finish while the cleanup
    allowance is still left."""

    def __init__(self, total_seconds: float | None = None, *, clock=time.monotonic):
        self.total = request_budget_seconds() if total_seconds is None else total_seconds
        self._clock = clock
        self._start = clock()

    def remaining(self) -> float:
        return self.total - (self._clock() - self._start)

    def call_timeout(self, wanted: float) -> float:
        """The per-attempt timeout for the next adapter call: `wanted`, or
        less if the budget is running out. Raises AIError(502,
        "ai_provider_error") rather than start a call that can't finish."""
        available = self.remaining() - CLEANUP_ALLOWANCE_SECONDS - (MAX_ATTEMPTS - 1) * RETRY_DELAY_SECONDS
        timeout = min(float(wanted), available / MAX_ATTEMPTS)
        if timeout < MIN_CALL_TIMEOUT_SECONDS:
            logger.warning("AI request budget used up before a provider call")
            raise AIError(502, "ai_provider_error")
        return timeout


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
