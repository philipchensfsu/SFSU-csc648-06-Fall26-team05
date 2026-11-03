"""E04: who's on a PRD. Owners and org admins invite people from the PRD's org,
change their roles and remove them; anyone can leave; every PRD keeps an owner."""

import pytest

from conftest import add_to_prd, org_prd


@pytest.fixture
def team(make_user, make_org, db):
    """Ada is the org admin; Olive owns the PRD; Ed edits it; Vic views it; Nia is in the org but not on it."""
    ada, olive, ed, vic, nia = (make_user() for _ in range(5))
    org = make_org(ada, olive, ed, vic, nia)
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    add_to_prd(db, prd, vic, "viewer")
    return dict(ada=ada, olive=olive, ed=ed, vic=vic, nia=nia, org=org, prd=prd)


def members(user, prd):
    r = user.api("GET", f"/prds/{prd}/members")
    assert r.status_code == 200, r.text
    return {m["user_id"]: m["role"] for m in r.json()}


def put(user, prd, target, role):
    return user.api("PUT", f"/prds/{prd}/members/{target.id}", json={"role": role})


def test_anyone_on_the_prd_can_list_its_members(team):
    expected = {team["olive"].id: "owner", team["ed"].id: "editor", team["vic"].id: "viewer"}
    assert members(team["vic"], team["prd"]) == expected
    assert members(team["ada"], team["prd"]) == expected
    first = team["vic"].api("GET", f"/prds/{team['prd']}/members").json()[0]
    assert first["user_id"] == team["olive"].id and first["granted_by"] == team["olive"].id and first["added_at"]


def test_people_who_cant_see_the_prd_get_404(team, make_user):
    assert team["nia"].api("GET", f"/prds/{team['prd']}/members").status_code == 404
    outsider = make_user()
    assert outsider.api("GET", f"/prds/{team['prd']}/members").status_code == 404
    r = put(outsider, team["prd"], outsider, "owner")
    assert r.status_code == 404 and r.json()["code"] == "not_found"


@pytest.mark.parametrize("manager", ["olive", "ada"])
def test_owners_and_org_admins_invite_change_and_remove(team, manager):
    who, prd, nia = team[manager], team["prd"], team["nia"]
    r = put(who, prd, nia, "viewer")
    assert r.status_code == 200, r.text
    added = next(m for m in r.json() if m["user_id"] == nia.id)
    assert added["role"] == "viewer" and added["granted_by"] == who.id
    assert put(who, prd, nia, "editor").status_code == 200
    assert members(nia, prd)[nia.id] == "editor"
    assert who.api("DELETE", f"/prds/{prd}/members/{nia.id}").status_code == 204
    assert nia.id not in members(team["olive"], prd)
    assert nia.api("GET", f"/prds/{prd}").status_code == 404


@pytest.mark.parametrize("caller", ["ed", "vic"])
def test_editors_and_viewers_cant_manage_people(team, caller):
    who, prd = team[caller], team["prd"]
    r = put(who, prd, team["nia"], "viewer")
    assert r.status_code == 403 and r.json()["code"] == "forbidden"
    assert put(who, prd, who, "owner").status_code == 403
    assert who.api("DELETE", f"/prds/{prd}/members/{team['olive'].id}").status_code == 403
    assert team["nia"].id not in members(team["olive"], prd)


def test_only_people_in_the_prds_org_can_be_added(team, make_user):
    r = put(team["olive"], team["prd"], make_user(), "viewer")
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"


def test_inactive_members_cant_be_added(team, db):
    db.execute("update organization_member set active = false where user_id = %s", (team["nia"].id,))
    r = put(team["olive"], team["prd"], team["nia"], "viewer")
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"


def test_an_unknown_role_is_422(team):
    r = put(team["olive"], team["prd"], team["nia"], "admin")
    assert r.status_code == 422 and r.json()["code"] == "validation_error"


def test_the_last_owner_cant_be_demoted_or_removed(team):
    olive, prd = team["olive"], team["prd"]
    r = put(olive, prd, olive, "editor")
    assert r.status_code == 409 and r.json()["code"] == "owner_required"
    r = team["ada"].api("DELETE", f"/prds/{prd}/members/{olive.id}")
    assert r.status_code == 409 and r.json()["code"] == "owner_required"
    assert olive.api("DELETE", f"/prds/{prd}/members/{olive.id}").status_code == 409


def test_with_a_second_owner_the_first_can_step_down(team):
    olive, ed, prd = team["olive"], team["ed"], team["prd"]
    assert put(olive, prd, ed, "owner").status_code == 200
    assert put(olive, prd, olive, "viewer").status_code == 200
    assert members(ed, prd)[olive.id] == "viewer"
    # Olive is a viewer now, so she can't manage people any more.
    assert put(olive, prd, olive, "owner").status_code == 403


def test_anyone_can_leave_a_prd(team):
    vic, prd = team["vic"], team["prd"]
    assert vic.api("DELETE", f"/prds/{prd}/members/{vic.id}").status_code == 204
    assert vic.api("GET", f"/prds/{prd}").status_code == 404
    # Removing someone who isn't on the PRD is a no-op for managers.
    assert team["olive"].api("DELETE", f"/prds/{prd}/members/{vic.id}").status_code == 204


def test_clients_still_cant_write_prd_member_directly(team):
    olive, nia, prd = team["olive"], team["nia"], team["prd"]
    r = olive.rest("POST", "prd_member", json={"prd_id": prd, "user_id": nia.id, "role": "owner"})
    assert r.status_code in (401, 403)
    r = olive.rest("POST", "rpc/lock_managed_prd", json={"target_prd": prd})
    assert r.status_code in (401, 403, 404)
    assert nia.id not in members(olive, prd)
