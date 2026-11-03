"""A01 Gemini client: settings, retries and the error code for each failure.

No network: a fake stands in for google.genai.Client, and replies are built
from the SDK's own response types so .text behaves as it does live.
Run from app/backend with: python -m pytest tests/test_gemini_client.py
"""

import logging
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from google.genai import errors as genai_errors
from google.genai import types

from ai import gemini_client
from ai.gemini_client import AIError, generate_json

PROMPT_TEXT = "Our secret launch plan"


class FakeModels:
    """Returns or raises the queued outcomes in order, one per call."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


def reply(text='{"ok": true}', finish="STOP", block_reason=None):
    candidates = []
    if text is not None:
        content = types.Content(role="model", parts=[types.Part(text=text)])
        candidates = [types.Candidate(content=content, finish_reason=finish)]
    feedback = None
    if block_reason:
        feedback = types.GenerateContentResponsePromptFeedback(block_reason=block_reason)
    usage = types.GenerateContentResponseUsageMetadata(
        prompt_token_count=120, candidates_token_count=45
    )
    return types.GenerateContentResponse(
        candidates=candidates, prompt_feedback=feedback, usage_metadata=usage
    )


def api_error(code, status="", reason=None):
    # Gemini's message can echo the request, so it carries the prompt text
    # here to prove it never reaches users or logs.
    error = {"code": code, "status": status, "message": f"Bad input: {PROMPT_TEXT}"}
    if reason:
        error["details"] = [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": reason}]
    error_class = genai_errors.ServerError if code >= 500 else genai_errors.ClientError
    return error_class(code, {"error": error})


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setattr(gemini_client, "_sleep", lambda seconds: None)
    monkeypatch.delenv("AI_ENABLED", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)

    def queue(*outcomes):
        models = FakeModels(outcomes)
        monkeypatch.setattr(gemini_client, "_get_client", lambda: SimpleNamespace(models=models))
        return models

    return queue


def call():
    return generate_json(PROMPT_TEXT, system_instruction="Reply with JSON.")


def expect_error(status_code, code):
    with pytest.raises(AIError) as info:
        call()
    assert (info.value.status_code, info.value.code) == (status_code, code)
    return info.value


def test_returns_parsed_json_model_and_token_counts(gemini):
    gemini(reply('{"sections": []}'))
    result = call()
    assert result.data == {"sections": []}
    assert result.model == gemini_client.DEFAULT_MODEL
    assert (result.prompt_tokens, result.output_tokens) == (120, 45)


def test_asks_for_json_with_the_schema_timeout_and_model(gemini, monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-test-model")
    models = gemini(reply())
    schema = {"type": "object"}
    generate_json(PROMPT_TEXT, system_instruction="Be brief.", response_schema=schema, timeout_seconds=30)
    sent = models.calls[0]
    assert sent["model"] == "gemini-test-model"
    assert sent["contents"] == PROMPT_TEXT
    assert sent["config"].response_mime_type == "application/json"
    assert sent["config"].response_json_schema == schema
    assert sent["config"].system_instruction == "Be brief."
    assert sent["config"].http_options.timeout == 30_000


def test_retries_a_server_error_once(gemini):
    models = gemini(api_error(503, "UNAVAILABLE"), reply())
    assert call().data == {"ok": True}
    assert len(models.calls) == 2


def test_gives_up_after_one_retry(gemini):
    models = gemini(api_error(503), api_error(500))
    expect_error(502, "ai_provider_error")
    assert len(models.calls) == 2


def test_rate_limit_is_not_retried(gemini):
    models = gemini(api_error(429, "RESOURCE_EXHAUSTED"))
    expect_error(429, "ai_provider_rate_limited")
    assert len(models.calls) == 1


@pytest.mark.parametrize(
    ("gemini_status", "reason", "status_code", "code"),
    [
        (402, None, 503, "ai_budget_exhausted"),
        (403, None, 503, "ai_unavailable"),
        (404, None, 503, "ai_unavailable"),
        (400, "API_KEY_INVALID", 503, "ai_unavailable"),
        (400, None, 502, "ai_provider_error"),
    ],
)
def test_maps_other_gemini_errors(gemini, gemini_status, reason, status_code, code):
    models = gemini(api_error(gemini_status, reason=reason))
    expect_error(status_code, code)
    assert len(models.calls) == 1


def test_timeout_is_not_retried(gemini):
    models = gemini(httpx.ReadTimeout("timed out"))
    expect_error(502, "ai_provider_error")
    assert len(models.calls) == 1


def test_connection_failure_is_retried_once(gemini):
    gemini(httpx.ConnectError("refused"), reply())
    assert call().data == {"ok": True}
    gemini(httpx.ConnectError("refused"), httpx.ConnectError("refused"))
    expect_error(503, "ai_unavailable")


@pytest.mark.parametrize(
    ("response", "status_code", "code"),
    [
        (reply(text=None, block_reason="SAFETY"), 422, "ai_output_blocked"),
        (reply(finish="SAFETY"), 422, "ai_output_blocked"),
        (reply('{"cut off', finish="MAX_TOKENS"), 502, "ai_invalid_output"),
        (reply("Sure! Here is your PRD."), 502, "ai_invalid_output"),
        (reply(""), 502, "ai_invalid_output"),
        (reply(text=None), 502, "ai_invalid_output"),
    ],
)
def test_unusable_replies(gemini, response, status_code, code):
    gemini(response)
    expect_error(status_code, code)


def test_off_switch_stops_requests_before_calling_gemini(gemini, monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "false")
    models = gemini(reply())
    expect_error(429, "ai_disabled")
    assert models.calls == []


def test_missing_api_key_fails_only_the_ai_request(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    gemini_client._get_client.cache_clear()
    with pytest.raises(AIError) as info:
        gemini_client._get_client()
    assert (info.value.status_code, info.value.code) == (503, "ai_unavailable")
    gemini_client._get_client.cache_clear()


def test_errors_keep_gemini_messages_out_of_responses_and_logs(gemini, caplog):
    gemini(api_error(400, "INVALID_ARGUMENT"))
    with caplog.at_level(logging.INFO, logger="nautilus.ai"):
        error = expect_error(502, "ai_provider_error")
    assert PROMPT_TEXT not in error.detail
    assert PROMPT_TEXT not in caplog.text
    assert "400" in caplog.text


def test_ai_error_works_with_the_shared_error_handler():
    # The S01 handler renders any HTTPException's `code` as {"detail", "code"}.
    error = AIError(429, "ai_disabled")
    assert isinstance(error, HTTPException)
    assert error.detail == gemini_client.MESSAGES["ai_disabled"]
