"""Feature 04: the signed-in user's Discord link routes (create a code, see the
link, unlink). The bot's side of linking is tested with routes/bot.py."""

import re
from datetime import datetime, timedelta, timezone

from conftest import SERVICE_KEY, data_api, http, API_URL

CODE = re.compile(r"^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$")
DISCORD_ID = "123456789012345678"


def link_code(user):
    r = user.api("POST", "/integrations/discord/link-code")
    assert r.status_code == 200, r.text
    return r.json()


def redeem(code):
    # What routes/bot.py will do for /link: the service role redeems it.
    r = data_api(
        "POST",
        "rpc/redeem_discord_link_code",
        token=SERVICE_KEY,
        json={"p_code": code, "p_discord_user_id": DISCORD_ID},
    )
    assert r.status_code == 200, r.text


def test_a_code_is_readable_and_expires_in_ten_minutes(make_user):
    ada = make_user()
    body = link_code(ada)
    assert CODE.match(body["code"])
    expires = datetime.fromisoformat(body["expires_at"])
    assert (
        timedelta(minutes=9)
        < expires - datetime.now(timezone.utc)
        <= timedelta(minutes=10)
    )


def test_the_link_shows_after_the_code_is_redeemed(make_user):
    ada = make_user()
    assert ada.api("GET", "/integrations/discord/link").json() == {
        "linked": False,
        "discord_user_id": None,
        "linked_at": None,
    }
    redeem(link_code(ada)["code"])
    body = ada.api("GET", "/integrations/discord/link").json()
    assert (
        body["linked"] is True
        and body["discord_user_id"] == DISCORD_ID
        and body["linked_at"]
    )


def test_people_see_only_their_own_link(make_user):
    ada, ben = make_user(), make_user()
    redeem(link_code(ada)["code"])
    assert ben.api("GET", "/integrations/discord/link").json()["linked"] is False


def test_unlinking_removes_the_link_and_repeating_it_succeeds(make_user):
    ada, ben = make_user(), make_user()
    redeem(link_code(ada)["code"])
    assert ben.api("DELETE", "/integrations/discord/link").status_code == 204
    assert ada.api("GET", "/integrations/discord/link").json()["linked"] is True
    assert ada.api("DELETE", "/integrations/discord/link").status_code == 204
    assert ada.api("GET", "/integrations/discord/link").json()["linked"] is False
    assert ada.api("DELETE", "/integrations/discord/link").status_code == 204


def test_a_new_code_replaces_the_one_before(make_user):
    ada = make_user()
    first, second = link_code(ada)["code"], link_code(ada)["code"]
    assert first != second
    r = data_api(
        "POST",
        "rpc/redeem_discord_link_code",
        token=SERVICE_KEY,
        json={"p_code": first, "p_discord_user_id": DISCORD_ID},
    )
    assert r.json()["message"] == "invalid_link_code"
    redeem(second)


def test_the_routes_need_a_signed_in_user():
    for method, path in (
        ("POST", "/integrations/discord/link-code"),
        ("GET", "/integrations/discord/link"),
        ("DELETE", "/integrations/discord/link"),
    ):
        assert http.request(method, f"{API_URL}{path}").status_code == 401, path
