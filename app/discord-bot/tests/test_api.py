"""The HTTP client: only the bot routes, the two headers on every request,
and errors turned into ApiError."""

import asyncio
import json

import httpx
import pytest

from nautilus_bot.api import ApiError
from tests.fakes import USER_ID, Backend

PRD = "11111111-1111-4111-8111-111111111111"


def call(backend, method, *args, **kwargs):
    async def go():
        api = backend.api()
        try:
            return await getattr(api, method)(*args, **kwargs)
        finally:
            await api.aclose()

    return asyncio.run(go())


def test_every_route_sends_the_secret_and_the_given_discord_user():
    ok = (200, {})
    backend = Backend(
        {
            ("POST", "/api/bot/link"): ok,
            ("GET", "/api/bot/me"): ok,
            ("GET", "/api/bot/prds"): ok,
            ("GET", f"/api/bot/prds/{PRD}"): ok,
            ("GET", "/api/bot/inbox"): ok,
            ("POST", f"/api/bot/prds/{PRD}/summary"): ok,
        }
    )
    call(backend, "link", USER_ID, "K7QX-M2PA-9DZR")
    call(backend, "me", USER_ID)
    call(backend, "prds", USER_ID, search="checkout", view="owned")
    call(backend, "prd", USER_ID, PRD)
    call(backend, "inbox", USER_ID, unread_only=False)
    call(backend, "summary", USER_ID, PRD)
    assert [(r.method, r.url.path) for r in backend.requests] == [
        ("POST", "/api/bot/link"),
        ("GET", "/api/bot/me"),
        ("GET", "/api/bot/prds"),
        ("GET", f"/api/bot/prds/{PRD}"),
        ("GET", "/api/bot/inbox"),
        ("POST", f"/api/bot/prds/{PRD}/summary"),
    ]
    for request in backend.requests:
        assert request.headers["X-Bot-Secret"] == "s3cret-bot"
        assert request.headers["X-Discord-User-Id"] == str(USER_ID)
    link, _, prds, _, inbox, summary = backend.requests
    assert json.loads(link.content) == {"code": "K7QX-M2PA-9DZR"}
    assert dict(prds.url.params) == {"limit": "10", "search": "checkout", "view": "owned"}
    assert dict(inbox.url.params) == {"unread_only": "false", "limit": "10"}
    assert summary.content == b""  # no version: the backend uses the current one


def test_a_summary_for_a_version_sends_it():
    backend = Backend({("POST", f"/api/bot/prds/{PRD}/summary"): (200, {})})
    call(backend, "summary", USER_ID, PRD, "22222222-2222-4222-8222-222222222222")
    assert json.loads(backend.requests[0].content) == {"version_id": "22222222-2222-4222-8222-222222222222"}


def test_errors_carry_status_code_and_retry_after():
    backend = Backend(
        {("POST", f"/api/bot/prds/{PRD}/summary"): (429, {"detail": "Wait.", "code": "ai_cooldown", "retry_after": 7})}
    )
    with pytest.raises(ApiError) as info:
        call(backend, "summary", USER_ID, PRD)
    assert (info.value.status, info.value.code, info.value.retry_after) == (429, "ai_cooldown", 7)


def test_retry_after_falls_back_to_the_header_and_non_json_errors_still_raise():
    backend = Backend({("GET", "/api/bot/me"): (429, {"code": "ai_busy"}, {"Retry-After": "12"})})
    with pytest.raises(ApiError) as info:
        call(backend, "me", USER_ID)
    assert info.value.retry_after == 12

    def bare(request):
        return httpx.Response(502, text="Bad gateway")

    backend = Backend()
    backend.handler = bare
    with pytest.raises(ApiError) as info:
        call(backend, "me", USER_ID)
    assert (info.value.status, info.value.code) == (502, None)


@pytest.mark.parametrize(
    "error, code",
    [
        (httpx.ReadTimeout("slow"), "timeout"),
        (httpx.ConnectError("down"), "unreachable"),
    ],
)
def test_network_failures_become_timeout_or_unreachable(error, code):
    with pytest.raises(ApiError) as info:
        call(Backend(error=error), "me", USER_ID)
    assert (info.value.status, info.value.code) == (0, code)
