"""S02: signed-out callers get no table access, users can't promote themselves,
PRD status grants no visibility, and a reader who can't edit gets 403 (#50)."""

import httpx

from conftest import API_URL, data_api


def scalar(db, query, *params):
    return db.execute(query, params).fetchone()[0]


def test_signed_out_callers_have_no_table_access(make_user, db):
    alice = make_user()
    assert data_api("GET", "prd?select=id&limit=1").status_code in (401, 403)
    assert data_api("POST", "project", json={"name": "it-anon", "owner_id": alice.id}).status_code in (401, 403)
    assert scalar(db, "select count(*) from information_schema.role_table_grants "
                      "where table_schema = 'public' and grantee = 'anon'") == 0


def test_signed_in_users_cannot_truncate_or_add_triggers(db):
    assert scalar(db, "select count(*) from information_schema.role_table_grants where table_schema = 'public' "
                      "and grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')") == 0


def test_new_tables_start_with_no_client_grants(db):
    db.execute("create table it_probe (id int)")
    try:
        grants = scalar(db, "select count(*) from information_schema.role_table_grants "
                            "where table_name = 'it_probe' and grantee in ('anon', 'authenticated')")
    finally:
        db.execute("drop table it_probe")
    assert grants == 0


def test_rls_helpers_are_for_signed_in_users_only(make_user):
    assert data_api("POST", "rpc/current_profile_role", json={}).status_code in (401, 403, 404)
    assert make_user().rest("POST", "rpc/current_profile_role", json={}).status_code == 200


def test_users_edit_only_their_name_and_team(make_user, db):
    alice = make_user()
    assert alice.rest("PATCH", f"profile?id=eq.{alice.id}", json={"role": "admin"}).status_code in (401, 403)
    assert alice.rest("PATCH", f"profile?id=eq.{alice.id}", json={"email": "x@example.com"}).status_code in (401, 403)
    assert alice.rest("POST", "profile", json={"id": alice.id, "email": "x@example.com"}).status_code in (401, 403)
    assert scalar(db, "select role from profile where id = %s", alice.id) == "pm"
    r = alice.rest("PATCH", f"profile?id=eq.{alice.id}", json={"full_name": "Alice", "team": "Growth"})
    assert r.status_code == 200 and r.json()


def test_status_grants_no_visibility(make_user, db):
    alice, erin, admin = make_user(), make_user("engineer"), make_user("admin")
    prd = alice.api("POST", "/prds", json={"title": "Final PRD"}).json()["id"]
    alice.api("PUT", f"/prds/{prd}/intake/problem", json={"answer_text": "secret"})
    db.execute("update prd set status = 'final' where id = %s", (prd,))
    assert erin.rest("GET", f"prd?id=eq.{prd}&select=id").json() == []
    assert erin.rest("GET", f"intake_answer?prd_id=eq.{prd}&select=id").json() == []
    assert erin.api("GET", f"/prds/{prd}").status_code == 404
    assert len(admin.rest("GET", f"prd?id=eq.{prd}&select=id").json()) == 1


def test_reader_without_edit_rights_gets_403_not_409(make_user, db):
    # An owner whose role became engineer can still read their PRD but not edit it.
    alice = make_user()
    prd = alice.api("POST", "/prds", json={"title": "Read only"}).json()
    db.execute("update profile set role = 'engineer' where id = %s", (alice.id,))
    r = alice.api("PUT", f"/prds/{prd['id']}", json={"revision": prd["revision"], "title": "Changed"})
    assert r.status_code == 403 and r.json()["code"] == "forbidden"
    assert scalar(db, "select title from prd where id = %s", prd["id"]) == "Read only"


def test_service_role_health_check_still_works():
    assert httpx.get(f"{API_URL}/health/db").status_code == 200
