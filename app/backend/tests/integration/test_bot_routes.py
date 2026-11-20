"""Feature 04: the Discord bot's requests, against the local stack. A linked
Discord account acts as exactly that person; nothing else gets through."""

import os

from conftest import API_URL, SERVICE_KEY, SUPABASE_URL, http

BOT_SECRET = os.environ.get("BOT_API_SECRET", "local-bot-secret")
DISCORD_A, DISCORD_B = "123456789012345678", "876543210987654321"


def bot(method, path, discord_id=DISCORD_A, secret=BOT_SECRET, **kwargs):
    headers = {"X-Bot-Secret": secret, "X-Discord-User-Id": discord_id}
    return http.request(method, f"{API_URL}{path}", headers=headers, **kwargs)


def link(user, discord_id=DISCORD_A):
    code = user.api("POST", "/integrations/discord/link-code").json()["code"]
    r = bot("POST", "/bot/link", discord_id, json={"code": code})
    assert r.status_code == 200, r.text
    return r.json()


def test_linking_then_acting_as_the_linked_person(make_user, db):
    ada = make_user()
    db.execute("update profile set full_name = 'Ada Admin' where id = %s", (ada.id,))
    assert link(ada) == {"linked": True, "full_name": "Ada Admin"}
    me = bot("GET", "/bot/me")
    assert me.status_code == 200
    assert me.json() == ada.api("GET", "/me").json()


def test_each_discord_account_acts_as_its_own_person(make_user):
    ada, ben = make_user(), make_user()
    link(ada, DISCORD_A)
    link(ben, DISCORD_B)
    assert bot("GET", "/bot/me", DISCORD_A).json()["id"] == ada.id
    assert bot("GET", "/bot/me", DISCORD_B).json()["id"] == ben.id


def test_an_unlinked_discord_account_gets_nothing(make_user):
    r = bot("GET", "/bot/me", "111111111111111111")
    assert r.status_code == 403 and r.json()["code"] == "discord_not_linked"
    ada = make_user()
    link(ada)
    assert ada.api("DELETE", "/integrations/discord/link").status_code == 204
    assert bot("GET", "/bot/me").json()["code"] == "discord_not_linked"


def test_a_wrong_secret_is_refused_even_for_a_linked_account(make_user):
    link(make_user())
    assert bot("GET", "/bot/me", secret="wrong").status_code == 401
    assert bot("POST", "/bot/link", secret="wrong", json={"code": "ABCD-EFGH-JKMN"}).status_code == 401


def test_bad_used_and_expired_codes(make_user, db):
    ada = make_user()
    r = bot("POST", "/bot/link", json={"code": "ABCD-EFGH-JKMN"})
    assert r.status_code == 404 and r.json()["code"] == "invalid_link_code"
    code = ada.api("POST", "/integrations/discord/link-code").json()["code"]
    assert bot("POST", "/bot/link", json={"code": code}).status_code == 200
    assert bot("POST", "/bot/link", DISCORD_B, json={"code": code}).json()["code"] == "invalid_link_code"
    code = ada.api("POST", "/integrations/discord/link-code").json()["code"]
    db.execute("update discord_link_code set expires_at = now() - interval '1 second' where profile_id = %s",
               (ada.id,))
    assert bot("POST", "/bot/link", DISCORD_B, json={"code": code}).json()["code"] == "invalid_link_code"


def test_a_banned_account_is_refused(make_user):
    ada = make_user()
    link(ada)
    admin = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    r = http.put(f"{SUPABASE_URL}/auth/v1/admin/users/{ada.id}", headers=admin, json={"ban_duration": "24h"})
    assert r.status_code == 200, r.text
    assert bot("GET", "/bot/me").json()["code"] == "discord_not_linked"


def test_leaving_the_organization_is_seen_as_that_person_would_see_it(make_user, db):
    ada = make_user()
    link(ada)
    assert bot("GET", "/bot/me").json()["organization"] is not None
    db.execute("update organization_member set active = false where user_id = %s", (ada.id,))
    assert bot("GET", "/bot/me").json()["organization"] is None


def test_no_response_carries_a_token(make_user):
    ada = make_user()
    linked = bot("POST", "/bot/link", json={"code": ada.api("POST", "/integrations/discord/link-code").json()["code"]})
    for r in (linked, bot("GET", "/bot/me")):
        assert "eyJ" not in r.text and "token" not in r.text.lower()
