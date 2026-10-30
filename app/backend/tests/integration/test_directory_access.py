"""E02 directory: GET /api/organizations/{id}/directory and the people function
behind it, against real RLS. Members see names; only admins see emails."""

from dataclasses import dataclass

import httpx
import pytest

from conftest import API_URL, data_api


@dataclass
class Directory:
    id: str
    product: str
    ops: str
    growth: str
    old_team: str
    alice: object  # admin, heads Product, leads Growth
    ben: object  # member in Product, reports to Alice, on Growth
    erin: object  # member with no department or team
    ada: object  # inactive member


@pytest.fixture
def directory(make_user, db):
    alice, ben, erin, ada = (make_user(org=False) for _ in range(4))
    for user, name in ((alice, "Alice PM"), (ben, "Ben PM"), (erin, "Erin Eng"), (ada, "Ada Gone")):
        db.execute("update profile set full_name = %s where id = %s", (name, user.id))
    org = db.execute("insert into organization (name, created_by) values ('Org X', %s) returning id::text",
                     (alice.id,)).fetchone()[0]
    product, ops = (db.execute("insert into department (organization_id, name) values (%s, %s) returning id::text",
                               (org, name)).fetchone()[0] for name in ("Product", "Ops"))
    growth = db.execute("insert into team (organization_id, department_id, name) values (%s, %s, 'Growth') "
                        "returning id::text", (org, product)).fetchone()[0]
    old_team = db.execute("insert into team (organization_id, department_id, name) values (%s, %s, 'Old team') "
                          "returning id::text", (org, ops)).fetchone()[0]
    db.execute("insert into organization_member (organization_id, user_id, department_id, access_role, title) "
               "values (%s, %s, %s, 'admin', 'Head of Product')", (org, alice.id, product))
    db.execute("insert into organization_member (organization_id, user_id, department_id, manager_id) "
               "values (%s, %s, %s, %s)", (org, ben.id, product, alice.id))
    db.execute("insert into organization_member (organization_id, user_id) values (%s, %s)", (org, erin.id))
    db.execute("insert into organization_member (organization_id, user_id, active) values (%s, %s, false)",
               (org, ada.id))
    for user in (alice, ben):
        db.execute("insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)",
                   (org, growth, user.id))
    db.execute("update department set head_id = %s where id = %s", (alice.id, product))
    db.execute("update team set lead_id = %s where id = %s", (alice.id, growth))
    db.execute("update team set archived_at = now() where id = %s", (old_team,))
    db.execute("update department set archived_at = now() where id = %s", (ops,))
    yield Directory(org, product, ops, growth, old_team, alice, ben, erin, ada)
    db.execute("delete from organization where id = %s", (org,))


def get(user, d):
    return user.api("GET", f"/organizations/{d.id}/directory")


def test_admin_gets_the_whole_directory(directory):
    d = directory
    r = get(d.alice, d)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["organization"] == {"id": d.id, "name": "Org X"}
    assert {x["name"]: (x["archived"], x["head_id"]) for x in body["departments"]} == {
        "Product": (False, d.alice.id), "Ops": (True, None)}
    assert {x["name"]: (x["archived"], x["lead_id"]) for x in body["teams"]} == {
        "Growth": (False, d.alice.id), "Old team": (True, None)}


def test_members_are_the_active_ones_sorted_by_name_with_their_details(directory):
    d = directory
    members = get(d.alice, d).json()["members"]
    assert [m["name"] for m in members] == ["Alice PM", "Ben PM", "Erin Eng"]
    alice, ben, erin = members
    assert (alice["access_role"], alice["title"], alice["team_ids"]) == ("admin", "Head of Product", [d.growth])
    assert (ben["access_role"], ben["manager_id"], ben["department_id"], ben["team_ids"]) == (
        "member", d.alice.id, d.product, [d.growth])
    assert (erin["department_id"], erin["team_ids"]) == (None, [])


def test_only_admins_see_emails(directory):
    d = directory
    assert {m["name"]: m["email"] for m in get(d.alice, d).json()["members"]}["Ben PM"] == d.ben.email
    members = get(d.ben, d).json()["members"]
    assert all(m["email"] is None for m in members) and all(m["name"] for m in members)


@pytest.mark.parametrize("who", ["inactive member", "outsider", "unknown org"])
def test_people_outside_the_org_get_404(directory, make_user, who):
    d = directory
    user = make_user() if who != "inactive member" else d.ada
    org = "00000000-0000-0000-0000-000000000000" if who == "unknown org" else d.id
    assert user.api("GET", f"/organizations/{org}/directory").status_code == 404


def test_signed_out_callers_get_401(directory):
    assert httpx.get(f"{API_URL}/organizations/{directory.id}/directory").status_code == 401


def test_the_people_function_answers_only_members(directory, make_user):
    d = directory
    outsider = make_user()
    assert outsider.rest("POST", "rpc/org_directory_people", json={"target_org": d.id}).json() == []
    rows = d.ben.rest("POST", "rpc/org_directory_people", json={"target_org": d.id}).json()
    # Inactive members are included, so past comments and approvals keep their authors.
    assert len(rows) == 4 and all(r["email"] is None for r in rows)
    assert data_api("POST", "rpc/org_directory_people", json={"target_org": d.id}).status_code in (401, 403, 404)


def test_profile_emails_stay_private_through_the_data_api(directory):
    d = directory
    assert d.ben.rest("GET", f"profile?select=email&id=eq.{d.alice.id}").json() == []
