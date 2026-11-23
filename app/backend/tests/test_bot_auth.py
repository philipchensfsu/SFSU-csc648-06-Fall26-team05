"""Feature 04: the bot's headers and the tokens signed for bot requests
(no network: every case here is refused before the database is reached)."""

import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt
import pytest
from fastapi.testclient import TestClient

import bot_auth
from main import app

client = TestClient(app)
SECRET, JWT_SECRET = "test-bot-secret", "test-jwt-secret-with-at-least-32-characters"
DISCORD_ID = "123456789012345678"


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setenv("BOT_API_SECRET", SECRET)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)


def call(
    path="/api/bot/me", secret=SECRET, discord_id=DISCORD_ID, method="GET", **kwargs
):
    headers = {}
    if secret is not None:
        headers["X-Bot-Secret"] = secret
    if discord_id is not None:
        headers["X-Discord-User-Id"] = discord_id
    return client.request(method, path, headers=headers, **kwargs)


@pytest.mark.parametrize("missing", ["BOT_API_SECRET", "SUPABASE_JWT_SECRET"])
def test_without_configuration_the_bot_routes_are_unavailable(monkeypatch, missing):
    monkeypatch.delenv(missing)
    r = call()
    assert r.status_code == 503 and r.json()["code"] == "bot_not_configured"


@pytest.mark.parametrize("secret", [None, "", "wrong", SECRET + "x"])
@pytest.mark.parametrize(
    "path, method", [("/api/bot/me", "GET"), ("/api/bot/link", "POST")]
)
def test_a_missing_or_wrong_secret_is_refused(secret, path, method):
    r = call(path, secret=secret, method=method, json={"code": "ABCD-EFGH-JKMN"})
    assert r.status_code == 401


@pytest.mark.parametrize(
    "discord_id", [None, "", "abc", "0123456789012345678", "1234", "1" * 21]
)
def test_the_discord_user_id_must_be_a_snowflake(discord_id):
    r = call(discord_id=discord_id)
    assert r.status_code == 422 and r.json()["code"] == "invalid_discord_user"


def test_signed_tokens_are_for_one_user_and_last_five_minutes():
    claims = jwt.decode(
        bot_auth.sign_token("00000000-0000-0000-0000-00000000a11c"),
        JWT_SECRET,
        algorithms=["HS256"],
        audience="authenticated",
    )
    assert claims["sub"] == "00000000-0000-0000-0000-00000000a11c"
    assert claims["role"] == "authenticated"
    assert claims["exp"] - claims["iat"] == 300 and abs(claims["iat"] - time.time()) < 5


def test_banned_accounts_are_recognized():
    now = datetime.now(timezone.utc)
    assert bot_auth.banned(SimpleNamespace(banned_until=now + timedelta(hours=1)))
    assert bot_auth.banned(
        SimpleNamespace(banned_until=(now + timedelta(hours=1)).isoformat())
    )
    assert not bot_auth.banned(SimpleNamespace(banned_until=now - timedelta(hours=1)))
    assert not bot_auth.banned(SimpleNamespace(banned_until=None))
    assert not bot_auth.banned(SimpleNamespace())
