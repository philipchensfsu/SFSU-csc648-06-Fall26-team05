"""Gemini connection shared by every AI feature (Backend Tasks A01).

This is the only module that talks to Gemini. AI routes call
generate_json() and get parsed JSON back, or an AIError that already holds
the HTTP status and error code the frontend expects. Generation, section
edits and review suggestions therefore share one timeout, one retry rule,
one off switch and one set of error codes.

Settings are environment variables: app/backend/.env locally, the Vercel
project settings in production. Never commit real values.

    GEMINI_API_KEY  Required for AI. Without it, AI requests fail with
                    503 ai_unavailable and the rest of the app still runs.
    GEMINI_MODEL    Optional. Defaults to DEFAULT_MODEL.
    AI_ENABLED      Optional. "false" turns every AI request off with
                    429 ai_disabled; manual editing keeps working.

Not handled here: the per-user cooldown and the one-request-at-a-time limit
need state shared across serverless instances, so they belong with the
routes and the database.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from functools import lru_cache

import httpx
from fastapi import HTTPException
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

DEFAULT_MODEL = "gemini-3.8-flash"
TIMEOUT_SECONDS = 60

# One retry for a brief Gemini outage. Timeouts are not retried: a request
# that already used the whole timeout would make the user wait twice as long.
MAX_ATTEMPTS = 2
RETRY_DELAY_SECONDS = 1.0
RETRYABLE_STATUS = {500, 502, 503, 504}

# Shown to users as-is, so they never include the prompt, the model's output
# or the key. Logs carry the details instead.
MESSAGES = {
    "ai_disabled": "AI is switched off right now. You can keep editing by hand.",
    "ai_unavailable": "AI isn't available right now. You can keep editing by hand.",
    "ai_budget_exhausted": "AI has reached its usage limit for now. You can keep editing by hand.",
    "ai_provider_rate_limited": "The AI service is busy. Try again in a minute.",
    "ai_provider_error": "The AI service didn't respond. Try again.",
    "ai_output_blocked": "The AI couldn't answer this request. Try rewording it.",
    "ai_invalid_output": "The AI's answer was incomplete. Try again.",
}

# Logs name the status, error type or finish reason only: never the prompt,
# the model's reply or Gemini's error message, which can echo the input.
logger = logging.getLogger("nautilus.ai")

# Swapped out by tests so retries don't actually wait.
_sleep = time.sleep


class AIError(HTTPException):
    """An AI request that could not produce a usable result.

    An HTTPException with a `code`, so the shared S01 error handler renders
    it as {"detail", "code"} without extra wiring.
    """

    def __init__(self, status_code: int, code: str):
        super().__init__(status_code=status_code, detail=MESSAGES[code])
        self.code = code


@dataclass(frozen=True)
class GeminiResult:
    data: object  # the parsed JSON reply: usually a dict
    model: str  # for generation_record.model
    prompt_tokens: int | None
    output_tokens: int | None


def ai_enabled() -> bool:
    value = os.environ.get("AI_ENABLED", "true").strip().lower()
    return value not in {"false", "0", "off", "no"}


def model_name() -> str:
    return os.environ.get("GEMINI_MODEL", "").strip() or DEFAULT_MODEL


@lru_cache(maxsize=1)
def _get_client() -> genai.Client:
    # Created on first use rather than at import, so a missing key only
    # affects AI requests. A failed attempt isn't cached.
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.error("GEMINI_API_KEY is not set")
        raise AIError(503, "ai_unavailable")
    return genai.Client(api_key=api_key)


def generate_json(
    prompt: str,
    *,
    system_instruction: str,
    response_schema: dict | None = None,
    max_output_tokens: int = 8192,
    timeout_seconds: float = TIMEOUT_SECONDS,
) -> GeminiResult:
    """Sends one prompt and returns Gemini's reply parsed as JSON.

    response_schema is an optional JSON Schema that Gemini is asked to
    follow. It guides the model but doesn't guarantee every rule, so
    callers still validate the result before showing it.

    Raises AIError for every failure.
    """
    if not ai_enabled():
        raise AIError(429, "ai_disabled")
    client = _get_client()
    model = model_name()
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        response_json_schema=response_schema,
        max_output_tokens=max_output_tokens,
        # HttpOptions.timeout is in milliseconds.
        http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000)),
    )
    response = _call_with_retry(client, model, prompt, config)
    data = _parse_json(response, model)
    usage = response.usage_metadata
    return GeminiResult(
        data=data,
        model=model,
        prompt_tokens=usage.prompt_token_count if usage else None,
        output_tokens=usage.candidates_token_count if usage else None,
    )


def _call_with_retry(client, model, prompt, config):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        last_attempt = attempt == MAX_ATTEMPTS
        try:
            return client.models.generate_content(model=model, contents=prompt, config=config)
        except genai_errors.APIError as exc:
            if exc.code in RETRYABLE_STATUS and not last_attempt:
                logger.warning("Gemini returned %s on %s; retrying once", exc.code, model)
                _sleep(RETRY_DELAY_SECONDS)
                continue
            raise _from_api_error(exc, model) from None
        except httpx.TimeoutException:
            # Checked before TransportError, which it subclasses.
            logger.error("Gemini timed out on %s", model)
            raise AIError(502, "ai_provider_error") from None
        except httpx.TransportError as exc:
            if not last_attempt:
                logger.warning("Couldn't reach Gemini (%s); retrying once", type(exc).__name__)
                _sleep(RETRY_DELAY_SECONDS)
                continue
            logger.error("Couldn't reach Gemini (%s)", type(exc).__name__)
            raise AIError(503, "ai_unavailable") from None


def _from_api_error(exc: genai_errors.APIError, model: str) -> AIError:
    reason = _error_reason(exc)
    logger.error("Gemini error %s %s %s on %s", exc.code, exc.status, reason or "", model)
    if exc.code == 429:
        return AIError(429, "ai_provider_rate_limited")
    if exc.code == 402:
        # A prepaid balance at $0 (paid tier only).
        return AIError(503, "ai_budget_exhausted")
    if exc.code in (401, 403, 404) or reason.startswith("API_KEY"):
        # A wrong or revoked key (Gemini reports a bad key as a 400 with
        # reason API_KEY_INVALID), the API turned off, or an unknown model.
        return AIError(503, "ai_unavailable")
    return AIError(502, "ai_provider_error")


def _error_reason(exc: genai_errors.APIError) -> str:
    # Google puts a machine-readable reason in error.details[].reason.
    details = exc.details if isinstance(exc.details, dict) else {}
    error = details.get("error", details)
    entries = error.get("details") if isinstance(error, dict) else None
    for entry in entries if isinstance(entries, list) else []:
        if isinstance(entry, dict) and isinstance(entry.get("reason"), str):
            return entry["reason"]
    return ""


def _parse_json(response, model: str):
    feedback = response.prompt_feedback
    block_reason = feedback.block_reason if feedback is not None else None
    if block_reason not in (None, types.BlockedReason.BLOCKED_REASON_UNSPECIFIED):
        logger.warning("Gemini blocked the prompt on %s: %s", model, block_reason)
        raise AIError(422, "ai_output_blocked")

    candidate = response.candidates[0] if response.candidates else None
    finish = candidate.finish_reason if candidate is not None else None
    if finish == types.FinishReason.MAX_TOKENS:
        logger.warning("Gemini reply hit max_output_tokens on %s", model)
        raise AIError(502, "ai_invalid_output")
    if finish not in (None, types.FinishReason.STOP, types.FinishReason.FINISH_REASON_UNSPECIFIED):
        # SAFETY, RECITATION, PROHIBITED_CONTENT and similar.
        logger.warning("Gemini stopped on %s: %s", model, finish)
        raise AIError(422, "ai_output_blocked")

    text = response.text
    if not text:
        logger.warning("Gemini returned no text on %s", model)
        raise AIError(502, "ai_invalid_output")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Gemini reply on %s wasn't valid JSON", model)
        raise AIError(502, "ai_invalid_output") from None
