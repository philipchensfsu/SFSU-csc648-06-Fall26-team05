"""Feature 04: Discord account links and one-time link codes, in the database.

People create codes for themselves; only the service role redeems them (the
backend does it for the bot). Links are readable and removable by their owner
only, and nobody writes them directly.
"""

import re
import threading
import time

from conftest import SERVICE_KEY, connect_db, data_api

CODE = re.compile(r"^[A-HJKMNP-Z2-9]{12}$")
DISCORD_A, DISCORD_B = "123456789012345678", "876543210987654321"


def new_code(user):
    r = user.rest("POST", "rpc/create_discord_link_code", json={})
    assert r.status_code == 200, r.text
    (row,) = r.json()
    return row["code"]


def redeem(code, discord_user_id=DISCORD_A):
    return data_api(
        "POST",
        "rpc/redeem_discord_link_code",
        token=SERVICE_KEY,
        json={"p_code": code, "p_discord_user_id": discord_user_id},
    )


def link_of(db, user):
    row = db.execute(
        "select discord_user_id from discord_link where profile_id = %s", (user.id,)
    ).fetchone()
    return row[0] if row else None


def error(r):
    return r.json().get("message")


def test_a_code_is_returned_once_and_stored_only_as_a_hash(make_user, db):
    ada = make_user()
    code = new_code(ada)
    assert CODE.match(code)
    stored, minutes = db.execute(
        "select code_hash, extract(epoch from expires_at - now()) / 60 from discord_link_code where profile_id = %s",
        (ada.id,),
    ).fetchone()
    assert bytes(stored) != code.encode() and len(bytes(stored)) == 32
    assert 9 < minutes <= 10


def test_redeeming_links_the_discord_account_and_uses_up_the_code(make_user, db):
    ada = make_user()
    code = new_code(ada)
    r = redeem(code)
    assert r.status_code == 200 and r.json() == ada.id
    assert link_of(db, ada) == DISCORD_A
    assert (
        db.execute(
            "select count(*) from discord_link_code where profile_id = %s", (ada.id,)
        ).fetchone()[0]
        == 0
    )
    again = redeem(code, DISCORD_B)
    assert again.status_code == 400 and error(again) == "invalid_link_code"


def test_codes_are_matched_like_join_codes(make_user, db):
    ada = make_user()
    code = new_code(ada)
    typed = f" {code[:4].lower()}-{code[4:8]} {code[8:].lower()} "
    assert redeem(typed).status_code == 200
    assert link_of(db, ada) == DISCORD_A


def test_unknown_and_expired_codes_are_refused(make_user, db):
    ada = make_user()
    assert error(redeem("ABCDEFGHJKMN")) == "invalid_link_code"
    code = new_code(ada)
    db.execute(
        "update discord_link_code set expires_at = now() - interval '1 second' where profile_id = %s",
        (ada.id,),
    )
    assert error(redeem(code)) == "invalid_link_code"
    assert link_of(db, ada) is None


def test_a_new_code_replaces_the_previous_one(make_user, db):
    ada = make_user()
    first, second = new_code(ada), new_code(ada)
    assert error(redeem(first)) == "invalid_link_code"
    assert redeem(second).status_code == 200


def test_discord_user_ids_must_be_snowflakes(make_user, db):
    ada = make_user()
    code = new_code(ada)
    for bad in ("", "abc", "0123456789012345678", "1234", "123456789012345678901"):
        assert error(redeem(code, bad)) == "invalid_discord_user", bad
    # The code survives a refused attempt.
    assert redeem(code).status_code == 200


def test_relinking_replaces_the_link_and_moves_a_discord_account(make_user, db):
    ada, ben = make_user(), make_user()
    redeem(new_code(ada), DISCORD_A)
    redeem(new_code(ada), DISCORD_B)
    assert link_of(db, ada) == DISCORD_B
    # Discord account B now links Ben; Ada is left unlinked.
    redeem(new_code(ben), DISCORD_B)
    assert link_of(db, ben) == DISCORD_B and link_of(db, ada) is None


def test_people_see_and_remove_only_their_own_link(make_user, db):
    ada, ben = make_user(), make_user()
    redeem(new_code(ada), DISCORD_A)
    redeem(new_code(ben), DISCORD_B)
    assert [
        row["discord_user_id"]
        for row in ada.rest("GET", "discord_link?select=*").json()
    ] == [DISCORD_A]
    # Ben's delete of Ada's link matches nothing.
    assert ben.rest("DELETE", f"discord_link?profile_id=eq.{ada.id}").json() == []
    assert link_of(db, ada) == DISCORD_A
    assert ada.rest("DELETE", f"discord_link?profile_id=eq.{ada.id}").status_code == 200
    assert link_of(db, ada) is None and link_of(db, ben) == DISCORD_B


def test_clients_cannot_write_links_or_touch_codes(make_user, db):
    ada = make_user()
    new_code(ada)
    insert = ada.rest(
        "POST",
        "discord_link",
        json={"profile_id": ada.id, "discord_user_id": DISCORD_A},
    )
    assert insert.status_code in (401, 403)
    redeem(new_code(ada), DISCORD_A)
    update = ada.rest(
        "PATCH",
        f"discord_link?profile_id=eq.{ada.id}",
        json={"discord_user_id": DISCORD_B},
    )
    assert update.status_code in (401, 403)
    assert ada.rest("GET", "discord_link_code?select=*").status_code in (401, 403)
    assert data_api("GET", "discord_link?select=*").status_code in (401, 403)
    assert link_of(db, ada) == DISCORD_A


def test_only_the_service_role_redeems_and_only_people_create_codes(make_user, db):
    ada = make_user()
    code = new_code(ada)
    as_user = ada.rest(
        "POST",
        "rpc/redeem_discord_link_code",
        json={"p_code": code, "p_discord_user_id": DISCORD_A},
    )
    assert as_user.status_code in (401, 403, 404)
    assert data_api("POST", "rpc/create_discord_link_code", json={}).status_code in (
        401,
        403,
        404,
    )
    service = data_api(
        "POST", "rpc/create_discord_link_code", token=SERVICE_KEY, json={}
    )
    assert error(service) == "not_authenticated"
    assert link_of(db, ada) is None


def test_two_redeems_of_one_code_link_once(make_user, db):
    ada = make_user()
    code = new_code(ada)
    results = []
    with connect_db() as holder:
        # Hold the code row so both redeems queue behind it, then release.
        holder.execute(
            "select 1 from discord_link_code where profile_id = %s for update",
            (ada.id,),
        )
        threads = [
            threading.Thread(target=lambda d=d: results.append(redeem(code, d)))
            for d in (DISCORD_A, DISCORD_B)
        ]
        for t in threads:
            t.start()
        time.sleep(1)
        holder.commit()
    for t in threads:
        t.join()
    assert sorted(r.status_code for r in results) == [200, 400]
    assert link_of(db, ada) in (DISCORD_A, DISCORD_B)
