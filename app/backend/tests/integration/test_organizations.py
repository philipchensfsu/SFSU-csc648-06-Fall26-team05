"""E01: a new account creates its organization and becomes its admin, at most
3 per account, and GET /api/me lists the account's active memberships."""

from concurrent.futures import ThreadPoolExecutor

import httpx

from conftest import API_URL, data_api


def create_org(user, name="Acme"):
    return user.api("POST", "/organizations", json={"name": name})


def test_new_account_has_no_memberships(make_user):
    alice = make_user()
    me = alice.api("GET", "/me").json()
    assert me["id"] == alice.id and me["email"] == alice.email and me["memberships"] == []


def test_creating_an_organization_makes_the_creator_its_admin(make_user, db):
    alice = make_user()
    r = create_org(alice, "  Acme  ")
    assert r.status_code == 201, r.text
    org = r.json()["organization_id"]

    assert alice.api("GET", "/me").json()["memberships"] == [
        {"organization_id": org, "name": "Acme", "access_role": "admin"}]
    member = db.execute("select access_role, department_id, active from organization_member "
                        "where organization_id = %s and user_id = %s", (org, alice.id)).fetchone()
    assert member == ("admin", None, True)
    # No structure is imposed: departments and teams are up to the org.
    for table in ("department", "team", "team_member"):
        assert db.execute(f"select count(*) from {table} where organization_id = %s", (org,)).fetchone()[0] == 0


def test_teams_can_exist_without_a_department(make_user, db):
    alice = make_user()
    org = create_org(alice).json()["organization_id"]
    db.execute("insert into team (organization_id, name) values (%s, 'Growth')", (org,))
    assert db.execute("select department_id from team where organization_id = %s", (org,)).fetchone()[0] is None


def test_each_account_can_create_at_most_three(make_user):
    alice = make_user()
    for name in ("One", "Two", "Three"):
        assert create_org(alice, name).status_code == 201
    r = create_org(alice, "Four")
    assert r.status_code == 409 and r.json()["code"] == "organization_limit"
    assert len(alice.api("GET", "/me").json()["memberships"]) == 3


def test_the_cap_holds_under_concurrent_requests(make_user, db):
    alice = make_user()
    with ThreadPoolExecutor(max_workers=6) as pool:
        statuses = sorted(pool.map(lambda i: create_org(alice, f"Org {i}").status_code, range(6)))
    assert statuses == [201, 201, 201, 409, 409, 409]
    assert db.execute("select count(*) from organization where created_by = %s", (alice.id,)).fetchone()[0] == 3


def test_blank_or_long_names_are_rejected(make_user):
    alice = make_user()
    for name in ("", "   ", "x" * 201):
        r = create_org(alice, name)
        assert r.status_code == 422 and r.json()["code"] == "validation_error"


def test_signed_out_callers_cannot_create_organizations():
    assert httpx.post(f"{API_URL}/organizations", json={"name": "Acme"}).status_code == 401
    assert data_api("POST", "rpc/create_organization", json={"org_name": "Acme"}).status_code in (401, 403, 404)


def test_organizations_are_only_created_through_the_function(make_user):
    alice = make_user()
    r = alice.rest("POST", "organization", json={"name": "Direct", "created_by": alice.id})
    assert r.status_code in (401, 403)


def test_other_users_see_neither_the_org_nor_the_membership(make_user):
    alice, ben = make_user(), make_user()
    org = create_org(alice).json()["organization_id"]
    assert ben.api("GET", "/me").json()["memberships"] == []
    assert ben.rest("GET", f"organization?id=eq.{org}&select=id").json() == []
    assert ben.api("GET", f"/organizations/{org}/directory").status_code == 404


def test_inactive_memberships_are_not_listed(make_user, db):
    alice = make_user()
    org = create_org(alice).json()["organization_id"]
    db.execute("update organization_member set active = false where organization_id = %s and user_id = %s",
               (org, alice.id))
    assert alice.api("GET", "/me").json()["memberships"] == []
