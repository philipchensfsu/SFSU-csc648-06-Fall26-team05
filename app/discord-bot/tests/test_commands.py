"""The slash command handlers with a fake interaction and a fake backend:
defer first, ephemeral replies, the caller's own Discord id, clear errors,
and nothing private in the logs."""

import asyncio
import logging

import discord
import pytest

from nautilus_bot import commands
from nautilus_bot import format as fmt
from tests.fakes import OTHER_ID, USER_ID, Backend, FakeInteraction

PRD = "11111111-1111-4111-8111-111111111111"
BRIEF = {"id": PRD, "title": "Checkout", "status": "draft", "review_state": None, "work_status": "not_started",
         "priority": "high", "my_role": "owner", "updated_at": "2026-11-18T10:00:00Z"}


def run(backend, handler, *args, user_id=USER_ID, **kwargs):
    interaction = FakeInteraction(user_id)
    backend.events = interaction.events

    async def go():
        api = backend.api()
        try:
            await handler(api, interaction, *args, **kwargs)
        finally:
            await api.aclose()
    asyncio.run(go())
    return interaction


CASES = [
    (commands.link, ("K7QX-M2PA-9DZR",), ("POST", "/api/bot/link"), {"linked": True, "full_name": "Olive"}),
    (commands.me, (), ("GET", "/api/bot/me"), {"id": "x", "full_name": "Olive", "organization": None}),
    (commands.prds, (), ("GET", "/api/bot/prds"), {"items": [BRIEF], "total": 1}),
    (commands.prd, (PRD,), ("GET", f"/api/bot/prds/{PRD}"),
     {**BRIEF, "description": None, "approval": {"state": None}, "owners": []}),
    (commands.inbox, (), ("GET", "/api/bot/inbox"), {"items": [], "next_cursor": None, "unread_count": 0}),
    (commands.summary, (PRD,), ("POST", f"/api/bot/prds/{PRD}/summary"),
     {"version_no": 2, "comment_count": 0, "summarized_comment_count": 0, "summary": {}}),
]


@pytest.mark.parametrize("handler, args, route, body", CASES, ids=[c[0].__name__ for c in CASES])
def test_each_command_defers_ephemerally_then_answers_as_the_caller(handler, args, route, body):
    backend = Backend({route: (200, body)})
    interaction = run(backend, handler, *args)
    kinds = [event[0] for event in interaction.events]
    assert kinds == ["defer", "request", "followup"]  # deferred before the backend is called
    assert interaction.events[0][1] == {"ephemeral": True, "thinking": True}
    reply = interaction.replies[0]
    assert reply["ephemeral"] is True
    assert reply["allowed_mentions"].everyone is False and reply["allowed_mentions"].users is False
    assert backend.requests[0].headers["X-Discord-User-Id"] == str(USER_ID)


def test_typed_input_never_changes_who_the_bot_asks_for():
    # Someone types another person's Discord id as the search text: still asked as themselves.
    backend = Backend({("GET", "/api/bot/prds"): (200, {"items": [], "total": 0})})
    run(backend, commands.prds, str(OTHER_ID))
    assert backend.requests[0].headers["X-Discord-User-Id"] == str(USER_ID)


def test_an_unlinked_account_is_told_how_to_link():
    backend = Backend({("GET", "/api/bot/me"): (403, {"detail": "x", "code": "discord_not_linked"})})
    assert run(backend, commands.me).replies[0]["content"] == fmt.LINK_HELP


@pytest.mark.parametrize("status, body, expected", [
    (404, {"code": "invalid_link_code"}, "expired"),
    (429, {"code": "ai_cooldown", "retry_after": 9}, "Try again in 9 seconds"),
    (429, {"code": "ai_busy", "retry_after": 30}, "already have an AI request running"),
    (429, {"code": "ai_disabled"}, "AI is switched off"),
    (429, {"code": "ai_budget_exhausted"}, "usage limit"),
    (502, {"code": "ai_provider_error"}, "couldn't produce a summary"),
    (503, {"code": "bot_not_configured"}, "isn't set up for the Discord bot"),
    (401, {"detail": "Invalid bot secret"}, "couldn't sign in"),
    (404, {"code": "not_found"}, "don't have access"),
])
def test_backend_errors_become_clear_replies(status, body, expected):
    backend = Backend({("POST", f"/api/bot/prds/{PRD}/summary"): (status, body),
                       ("POST", "/api/bot/link"): (status, body)})
    handler, args = (commands.link, ("K7QX",)) if body.get("code") == "invalid_link_code" else \
        (commands.summary, (PRD,))
    interaction = run(backend, handler, *args)
    assert expected in interaction.replies[0]["content"]
    assert interaction.replies[0]["ephemeral"] is True


def test_a_summary_that_times_out_warns_it_may_still_count():
    import httpx
    interaction = run(Backend(error=httpx.ReadTimeout("slow")), commands.summary, PRD)
    assert "may still finish" in interaction.replies[0]["content"]


def test_a_bad_id_is_refused_without_calling_the_backend():
    backend = Backend()
    for handler in (commands.prd, commands.summary):
        interaction = run(backend, handler, "not-a-uuid")
        assert interaction.events[0][0] == "send_message" and interaction.replies[0]["ephemeral"] is True
    assert backend.requests == []


def test_an_expired_interaction_stops_before_the_backend():
    backend = Backend()
    response = type("R", (), {"status": 404, "reason": "Not Found"})()
    interaction = FakeInteraction(defer_error=discord.NotFound(response, "Unknown interaction"))
    backend.events = interaction.events

    async def go():
        api = backend.api()
        await commands.me(api, interaction)
        await api.aclose()
    asyncio.run(go())
    assert backend.requests == [] and interaction.replies == []


def test_logs_never_hold_codes_search_text_or_content(caplog):
    caplog.set_level(logging.DEBUG)
    secret_bits = ["K7QX-M2PA-9DZR", "confidential launch", "s3cret-bot", "Checkout"]
    run(Backend({("POST", "/api/bot/link"): (404, {"code": "invalid_link_code"})}), commands.link, secret_bits[0])
    run(Backend({("GET", "/api/bot/prds"): (200, {"items": [BRIEF], "total": 1})}), commands.prds, secret_bits[1])
    logged = caplog.text
    assert "command=link status=404 code=invalid_link_code" in logged and "command=prds status=ok" in logged
    for bit in secret_bits:
        assert bit not in logged


def test_all_six_commands_are_registered_and_nothing_else():
    client = discord.Client(intents=discord.Intents.none())
    tree = discord.app_commands.CommandTree(client)
    commands.register(tree, api=None)
    assert sorted(c.name for c in tree.get_commands()) == ["inbox", "link", "me", "prd", "prds", "summary"]
