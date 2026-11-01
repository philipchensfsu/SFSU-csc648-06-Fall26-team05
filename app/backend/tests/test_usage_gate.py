"""Per-user AI usage gate (app/backend/ai/usage_gate.py).

A fake stands in for the user's Supabase client. The database side
(cooldown, one lease per user, expiry takeover, lease-checked release,
concurrent admissions) is checked against Postgres by the SQL suite in the
PR description.
Run from app/backend with: python -m pytest tests/test_usage_gate.py
"""

import logging
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors
from google.genai import types

from ai import gemini_client, usage_gate
from ai.gemini_client import AIError, generate_json
from ai.usage_gate import UsageLimitError, admitted
from errors import register_error_handlers

LEASE = "5e0f6b7a-1c2d-4e3f-8a9b-0c1d2e3f4a5b"


class FakeUserClient:
    """Answers ai_admit and ai_release; records every call."""

    def __init__(self, admit_row=None, release_result=True, release_error=None):
        self.admit_row = admit_row or {"lease_id": LEASE, "refused": None, "retry_after": None}
        self.release_result = release_result
        self.release_error = release_error
        self.calls = []
        self._pending = None

    def rpc(self, name, params):
        self.calls.append((name, params))
        self._pending = name
        return self

    def execute(self):
        if self._pending == "ai_admit":
            return SimpleNamespace(data=[self.admit_row])
        if self.release_error:
            raise self.release_error
        return SimpleNamespace(data=self.release_result)


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    for name in ("AI_ENABLED", "AI_COOLDOWN_SECONDS", "AI_LEASE_SECONDS", "GEMINI_MODEL",
                 "AI_REQUEST_BUDGET_SECONDS", "AI_SCOPE_TIMEOUT_SECONDS", "AI_MAIN_TIMEOUT_SECONDS"):
        monkeypatch.delenv(name, raising=False)


def names(client):
    return [name for name, _ in client.calls]


# --- admission -----------------------------------------------------------------


def test_admitted_request_runs_and_releases_its_lease():
    client = FakeUserClient()
    with admitted(client) as lease:
        assert lease == LEASE
        assert names(client) == ["ai_admit"]
    assert client.calls[1] == ("ai_release", {"p_lease_id": LEASE})
    assert client.calls[0][1] == {
        "p_cooldown_seconds": usage_gate.DEFAULT_COOLDOWN_SECONDS,
        "p_lease_seconds": usage_gate.DEFAULT_LEASE_SECONDS,
    }


def test_lease_is_released_when_the_request_fails():
    client = FakeUserClient()
    with pytest.raises(AIError):
        with admitted(client):
            raise AIError(502, "ai_invalid_output")
    assert names(client) == ["ai_admit", "ai_release"]


@pytest.mark.parametrize("refused, code", [("busy", "ai_busy"), ("cooldown", "ai_cooldown")])
def test_refusals_are_429s_with_retry_after(refused, code):
    client = FakeUserClient({"lease_id": None, "refused": refused, "retry_after": 7})
    ran = False
    with pytest.raises(UsageLimitError) as info:
        with admitted(client):
            ran = True
    assert not ran
    assert (info.value.status_code, info.value.code) == (429, code)
    assert info.value.extra == {"retry_after": 7}
    assert info.value.headers == {"Retry-After": "7"}
    assert names(client) == ["ai_admit"]  # nothing to release


@pytest.mark.parametrize("value", ["false", "0", "off", "no"])
def test_off_switch_refuses_before_touching_the_gate(monkeypatch, value):
    monkeypatch.setenv("AI_ENABLED", value)
    client = FakeUserClient()
    with pytest.raises(AIError) as info:
        with admitted(client):
            pass
    assert (info.value.status_code, info.value.code) == (429, "ai_disabled")
    assert client.calls == []


# --- release edge cases --------------------------------------------------------


def test_late_release_after_takeover_only_logs(caplog):
    client = FakeUserClient(release_result=False)
    with caplog.at_level(logging.WARNING, logger="nautilus.ai"):
        with admitted(client):
            pass
    assert "already expired" in caplog.text


def test_release_failure_doesnt_hide_the_result(caplog):
    client = FakeUserClient(release_error=ConnectionError("db down"))
    with caplog.at_level(logging.ERROR, logger="nautilus.ai"):
        with admitted(client) as lease:
            result = lease
    assert result == LEASE
    assert "expires on its own" in caplog.text


# --- settings ------------------------------------------------------------------


def test_lease_outlasts_the_slowest_admitted_request():
    slowest = gemini_client.MAX_ATTEMPTS * gemini_client.TIMEOUT_SECONDS + gemini_client.RETRY_DELAY_SECONDS
    assert usage_gate.DEFAULT_LEASE_SECONDS > slowest


def test_settings_come_from_the_environment(monkeypatch):
    monkeypatch.setenv("AI_COOLDOWN_SECONDS", "30")
    monkeypatch.setenv("AI_LEASE_SECONDS", "300")
    client = FakeUserClient()
    with admitted(client):
        pass
    assert client.calls[0][1] == {"p_cooldown_seconds": 30, "p_lease_seconds": 300}


@pytest.mark.parametrize("name, value", [
    ("AI_COOLDOWN_SECONDS", "ten"),
    ("AI_COOLDOWN_SECONDS", "-1"),
    ("AI_LEASE_SECONDS", "5"),
    ("AI_LEASE_SECONDS", "99999"),
])
def test_bad_settings_fall_back_to_defaults(monkeypatch, caplog, name, value):
    monkeypatch.setenv(name, value)
    with caplog.at_level(logging.ERROR, logger="nautilus.ai"):
        assert usage_gate.cooldown_seconds() == usage_gate.DEFAULT_COOLDOWN_SECONDS
        assert usage_gate.lease_seconds() == usage_gate.DEFAULT_LEASE_SECONDS
    assert name in caplog.text


# --- retries inside one admission ------------------------------------------------


def test_provider_retry_happens_inside_one_admission(monkeypatch):
    attempts = []

    def generate_content(*, model, contents, config):
        attempts.append(model)
        if len(attempts) == 1:
            raise genai_errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE", "message": "busy"}})
        content = types.Content(role="model", parts=[types.Part(text='{"ok": true}')])
        return types.GenerateContentResponse(candidates=[types.Candidate(content=content, finish_reason="STOP")])

    fake_genai = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(gemini_client, "_get_client", lambda: fake_genai)
    monkeypatch.setattr(gemini_client, "_sleep", lambda seconds: None)
    client = FakeUserClient()
    with admitted(client):
        result = generate_json("ping", system_instruction="Reply with JSON.")
    assert result.data == {"ok": True}
    assert len(attempts) == 2
    assert names(client) == ["ai_admit", "ai_release"]  # one admission for both attempts


# --- how the API renders refusals ------------------------------------------------


def render(error):
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/ai")
    def ai_route():
        raise error

    return TestClient(app).get("/ai")


def test_cooldown_renders_with_retry_after_in_body_and_header():
    response = render(UsageLimitError("ai_cooldown", 12))
    assert response.status_code == 429
    assert response.json() == {"detail": usage_gate.MESSAGES["ai_cooldown"], "code": "ai_cooldown", "retry_after": 12}
    assert response.headers["retry-after"] == "12"


def test_disabled_renders_without_retry_after():
    response = render(AIError(429, "ai_disabled"))
    assert response.status_code == 429
    assert response.json()["code"] == "ai_disabled" and "retry_after" not in response.json()


# --- the request budget and the lease -------------------------------------------------


def test_defaults_fit_inside_vercels_300_seconds_and_the_lease_outlasts_the_budget():
    assert usage_gate.DEFAULT_REQUEST_BUDGET_SECONDS == 170 and usage_gate.lease_seconds() == 200
    scope_worst = 2 * usage_gate.DEFAULT_SCOPE_TIMEOUT_SECONDS + gemini_client.RETRY_DELAY_SECONDS
    main_worst = 2 * usage_gate.DEFAULT_MAIN_TIMEOUT_SECONDS + gemini_client.RETRY_DELAY_SECONDS
    assert scope_worst + main_worst + usage_gate.CLEANUP_ALLOWANCE_SECONDS <= usage_gate.DEFAULT_REQUEST_BUDGET_SECONDS
    assert usage_gate.DEFAULT_REQUEST_BUDGET_SECONDS < usage_gate.lease_seconds() < 300


def test_lease_follows_the_budget_and_never_falls_below_it(monkeypatch, caplog):
    monkeypatch.setenv("AI_REQUEST_BUDGET_SECONDS", "120")
    assert usage_gate.lease_seconds() == 150
    monkeypatch.setenv("AI_LEASE_SECONDS", "100")
    with caplog.at_level(logging.ERROR, logger="nautilus.ai"):
        assert usage_gate.lease_seconds() == 150
    assert "must outlast" in caplog.text


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_budget_gives_the_wanted_timeout_while_there_is_room():
    budget = usage_gate.RequestBudget(170, clock=Clock())
    assert budget.call_timeout(10) == 10 and budget.call_timeout(60) == 60


def test_budget_shrinks_then_refuses_calls_it_cannot_finish():
    clock = Clock()
    budget = usage_gate.RequestBudget(170, clock=clock)
    clock.now = 120  # 170 - 120 - 20 - 1 = 29 s left for two attempts
    assert budget.call_timeout(60) == pytest.approx(14.5)
    clock.now = 140  # 9 s left: under the 5 s minimum per attempt
    with pytest.raises(AIError) as info:
        budget.call_timeout(60)
    assert info.value.code == "ai_provider_error"
