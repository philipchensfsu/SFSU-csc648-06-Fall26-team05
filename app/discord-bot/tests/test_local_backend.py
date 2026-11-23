"""The bot's client against a real local backend with Vineela's bot routes
(#169–#172). Skipped unless BOT_LOCAL_BACKEND=1.

Needs the local stack only (never hosted): `supabase db reset` (seed users),
the API with BOT_API_SECRET and SUPABASE_JWT_SECRET set as in compose.yaml,
and AI switched off or no Gemini key, so /summary never reaches Gemini.

    BOT_LOCAL_BACKEND=1 NAUTILUS_API_URL=http://localhost:8000 BOT_API_SECRET=local-bot-secret \
    SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<supabase status> python -m pytest tests/test_local_backend.py

Uses the seed accounts from supabase/seed.sql (local-only passwords). Links
are removed again at the end.
"""

import asyncio
import os
import random

import httpx
import pytest

from nautilus_bot import commands
from nautilus_bot.api import ApiError, NautilusApi
from tests.fakes import FakeInteraction

pytestmark = pytest.mark.skipif(os.environ.get("BOT_LOCAL_BACKEND") != "1", reason="needs the local backend")

API = os.environ.get("NAUTILUS_API_URL", "http://localhost:8000")
SEED = {"alice": ("alice.pm@example.com", "password1"), "ada": ("ada.admin@example.com", "password4")}


def snowflake() -> int:
    return random.randint(10**17, 10**18 - 1)


def sign_in(who):
    email, password = SEED[who]
    r = httpx.post(
        f"{os.environ['SUPABASE_URL']}/auth/v1/token?grant_type=password",
        headers={"apikey": os.environ["SUPABASE_ANON_KEY"]},
        json={"email": email, "password": password},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def web(token, method, path):
    return httpx.request(method, f"{API}{path}", headers={"Authorization": f"Bearer {token}"})


@pytest.fixture
def linked():
    """Alice and Ada linked to fresh Discord ids through the real code flow."""
    tokens, ids = {who: sign_in(who) for who in SEED}, {who: snowflake() for who in SEED}

    async def link_all():
        api = NautilusApi(API, os.environ["BOT_API_SECRET"])
        try:
            for who in SEED:
                code = web(tokens[who], "POST", "/api/integrations/discord/link-code").json()["code"]
                assert (await api.link(ids[who], code.lower().replace("-", " ")))["linked"] is True
                with pytest.raises(ApiError) as info:  # a code works once
                    await api.link(ids[who], code)
                assert info.value.code == "invalid_link_code"
        finally:
            await api.aclose()

    asyncio.run(link_all())
    yield ids
    for who in SEED:
        web(tokens[who], "DELETE", "/api/integrations/discord/link")


def ask(handler, user_id, *args):
    interaction = FakeInteraction(user_id)

    async def go():
        api = NautilusApi(API, os.environ["BOT_API_SECRET"])
        try:
            await handler(api, interaction, *args)
        finally:
            await api.aclose()

    asyncio.run(go())
    return interaction.replies[-1]["content"]


def test_every_command_answers_as_the_linked_person(linked):
    assert "Alice" in ask(commands.me, linked["alice"])
    listing = ask(commands.prds, linked["alice"])
    assert "PRD" in listing and "`" in listing
    prd_id = listing.split("`")[1]
    assert "Status:" in ask(commands.prd, linked["alice"], prd_id)
    assert "notification" in ask(commands.inbox, linked["alice"]).lower() or "unread" in ask(
        commands.inbox, linked["alice"]
    )
    summary = ask(commands.summary, linked["alice"], prd_id)
    # No comments gives an empty summary without the AI; otherwise AI is off locally.
    assert "nothing to summarize" in summary or "AI is switched off" in summary or "Discussion summary" in summary
    # Ada is in another organization: Alice's PRD doesn't exist for her.
    assert "don't have access" in ask(commands.prd, linked["ada"], prd_id)


def test_unlinked_accounts_and_a_wrong_secret_are_refused(linked):
    assert "isn't linked to Nautilus" in ask(commands.me, snowflake())

    async def wrong_secret():
        api = NautilusApi(API, "not-the-secret")
        try:
            await api.me(linked["alice"])
        finally:
            await api.aclose()

    with pytest.raises(ApiError) as info:
        asyncio.run(wrong_secret())
    assert info.value.status == 401
