"""A07 usage gate against the local stack: ai_admit and ai_release called
with real user tokens through the Data API, as the backend calls them."""

from conftest import data_api


def admit(user, cooldown=10, lease=200):
    r = user.rest("POST", "rpc/ai_admit", json={"p_cooldown_seconds": cooldown, "p_lease_seconds": lease})
    assert r.status_code == 200, r.text
    return r.json()[0]


def release(user, lease_id):
    return user.rest("POST", "rpc/ai_release", json={"p_lease_id": lease_id}).json()


def test_one_request_at_a_time_then_cooldown(make_user):
    alice = make_user()
    first = admit(alice)
    assert first["lease_id"] and first["refused"] is None
    busy = admit(alice)
    assert busy["lease_id"] is None and busy["refused"] == "busy" and busy["retry_after"] >= 1
    assert release(alice, first["lease_id"]) is True
    cooling = admit(alice)
    assert cooling["refused"] == "cooldown" and 1 <= cooling["retry_after"] <= 10
    assert admit(alice, cooldown=0)["lease_id"]  # no cooldown configured: admitted


def test_users_have_separate_gates_and_cant_release_each_others_lease(make_user):
    alice, ben = make_user(), make_user()
    lease = admit(alice)["lease_id"]
    assert admit(ben)["lease_id"]  # Ben isn't held up by Alice
    assert release(ben, lease) is False  # Ben can't free Alice's lease
    assert admit(alice)["refused"] == "busy"


def test_an_old_lease_cant_release_a_newer_one(make_user, db):
    alice = make_user()
    old = admit(alice)["lease_id"]
    db.execute("update ai_usage_gate set lease_expires_at = now() - interval '1 second', "
               "last_admitted_at = now() - interval '1 hour' where user_id = %s", (alice.id,))
    new = admit(alice)["lease_id"]  # the expired lease is taken over
    assert new and new != old
    assert release(alice, old) is False
    assert admit(alice)["refused"] == "busy"


def test_signed_out_callers_and_bad_settings_are_refused(make_user):
    body = {"p_cooldown_seconds": 10, "p_lease_seconds": 200}
    assert data_api("POST", "rpc/ai_admit", json=body).status_code in (401, 403, 404)
    alice = make_user()
    r = alice.rest("POST", "rpc/ai_admit", json={"p_cooldown_seconds": -1, "p_lease_seconds": 200})
    assert r.status_code == 400
    assert alice.rest("GET", "ai_usage_gate?select=user_id").status_code in (401, 403)
