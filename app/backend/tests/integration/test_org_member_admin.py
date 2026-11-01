"""E02 part 2: org admins change members' role, department, manager, title and
active flag. The org keeps an admin, and deactivation decides what's left behind."""

from concurrent.futures import ThreadPoolExecutor

import pytest

from conftest import add_to_prd, org_prd


@pytest.fixture
def org(make_user, make_org, db):
    """Ada is the admin; Mia, Max and Moe are members; Oz runs another organization."""
    ada, mia, max_, moe, oz = (make_user() for _ in range(5))
    org_id = make_org(ada, mia, max_, moe)
    other = make_org(oz)
    return dict(ada=ada, mia=mia, max=max_, moe=moe, oz=oz, id=org_id, other=other)


def patch(org, who, target, **changes):
    return org[who].api("PATCH", f"/organizations/{org['id']}/members/{org[target].id}", json=changes)


def member(db, org, who):
    return db.execute("select active, access_role, department_id::text, manager_id::text, title "
                      "from organization_member where organization_id = %s and user_id = %s",
                      (org["id"], org[who].id)).fetchone()


def department(db, org, name="Product"):
    return db.execute("insert into department (organization_id, name) values (%s, %s) returning id::text",
                      (org["id"], name)).fetchone()[0]


def test_admins_change_role_department_manager_and_title(org, db):
    dept = department(db, org)
    r = patch(org, "ada", "mia", access_role="admin", department_id=dept, manager_id=org["max"].id, title="  PM  ")
    assert r.status_code == 200, r.text
    assert r.json() == {"user_id": org["mia"].id, "active": True, "access_role": "admin", "department_id": dept,
                        "manager_id": org["max"].id, "title": "PM"}
    r = patch(org, "ada", "mia", department_id=None, manager_id=None, title="")
    assert r.status_code == 200 and (r.json()["department_id"], r.json()["manager_id"], r.json()["title"]) == (
        None, None, None)
    assert r.json()["access_role"] == "admin"  # untouched


def test_members_get_403_and_outsiders_404(org):
    assert patch(org, "mia", "max", title="Boss").status_code == 403
    assert patch(org, "oz", "max", title="Boss").status_code == 404
    r = org["ada"].api("PATCH", f"/organizations/{org['id']}/members/{org['oz'].id}", json={"title": "x"})
    assert r.status_code == 404


def test_bad_values_are_422(org):
    assert patch(org, "ada", "mia", access_role="owner").status_code == 422
    assert patch(org, "ada", "mia", title="x" * 101).status_code == 422
    assert patch(org, "ada", "mia", nickname="x").status_code == 422
    for null_field in ("access_role", "active"):
        r = patch(org, "ada", "mia", **{null_field: None})
        assert r.status_code == 422 and r.json()["code"] == "validation_error", null_field


def test_reporting_lines_cant_loop_or_point_outside(org):
    assert patch(org, "ada", "mia", manager_id=org["max"].id).status_code == 200
    r = patch(org, "ada", "max", manager_id=org["mia"].id)
    assert r.status_code == 422 and r.json()["code"] == "manager_cycle"
    r = patch(org, "ada", "max", manager_id=org["oz"].id)
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"
    r = patch(org, "ada", "max", manager_id=org["max"].id)
    assert r.status_code in (400, 422)  # can't manage yourself (table check)


def test_the_last_admin_stays(org, db):
    for change in ({"access_role": "member"}, {"active": False}):
        r = patch(org, "ada", "ada", **change)
        assert r.status_code == 409 and r.json()["code"] == "last_admin"
    assert patch(org, "ada", "mia", access_role="admin").status_code == 200
    assert patch(org, "ada", "ada", access_role="member").status_code == 200
    assert member(db, org, "ada")[1] == "member"


def test_two_admins_demoting_each_other_at_once_leave_one(org, db):
    patch(org, "ada", "mia", access_role="admin")
    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = sorted(pool.map(lambda pair: patch(org, pair[0], pair[1], access_role="member").status_code,
                                [("ada", "mia"), ("mia", "ada")]))
    assert codes in ([200, 403], [200, 409])  # the second sees the first: no longer an admin, or the last one
    admins = db.execute("select count(*) from organization_member where organization_id = %s and active "
                        "and access_role = 'admin'", (org["id"],)).fetchone()[0]
    assert admins == 1


def test_deactivating_a_manager_needs_a_decision_about_their_reports(org, db):
    patch(org, "ada", "mia", manager_id=org["max"].id)
    patch(org, "ada", "moe", manager_id=org["max"].id)
    r = patch(org, "ada", "max", active=False)
    assert r.status_code == 409 and r.json()["code"] == "has_direct_reports"
    assert sorted(r.json()["reports"]) == sorted([org["mia"].id, org["moe"].id])
    assert member(db, org, "max")[0] is True
    r = patch(org, "ada", "max", active=False, replacement_manager_id=org["oz"].id)
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"
    r = patch(org, "ada", "max", active=False, replacement_manager_id=org["ada"].id)
    assert r.status_code == 200 and r.json()["active"] is False
    assert member(db, org, "mia")[3] == org["ada"].id and member(db, org, "moe")[3] == org["ada"].id


def test_reports_can_be_left_without_a_manager(org, db):
    patch(org, "ada", "mia", manager_id=org["max"].id)
    assert patch(org, "ada", "max", active=False, replacement_manager_id=None).status_code == 200
    assert member(db, org, "mia")[3] is None


def test_deactivating_the_only_owner_of_prds_needs_a_new_owner(org, db):
    solo = org_prd(db, org["id"], org["max"], "Max's PRD")
    shared = org_prd(db, org["id"], org["max"], "Shared PRD")
    add_to_prd(db, shared, org["moe"], "owner")
    add_to_prd(db, solo, org["mia"], "editor")
    r = patch(org, "ada", "max", active=False)
    assert r.status_code == 409 and r.json()["code"] == "owns_prds"
    assert r.json()["prds"] == [{"prd_id": solo, "title": "Max's PRD"}]
    r = patch(org, "ada", "max", active=False, transfer_owner_to=org["mia"].id)
    assert r.status_code == 200, r.text
    roles = dict(db.execute("select user_id::text, role from prd_member where prd_id = %s", (solo,)).fetchall())
    assert roles[org["mia"].id] == "owner"
    # Recorded like any role change (which notifies the person once #93 is in).
    events = db.execute("select event_type, actor_id::text, payload from prd_event where prd_id = %s", (solo,)).fetchall()
    assert events == [("member_role_changed", org["ada"].id, {"user_id": org["mia"].id, "from": "editor", "to": "owner"})]


def test_deactivation_clears_head_and_lead_positions_and_access(org, db):
    dept = department(db, org)
    team = db.execute("insert into team (organization_id, name) values (%s, 'Growth') returning id::text",
                      (org["id"],)).fetchone()[0]
    patch(org, "ada", "max", department_id=dept)
    db.execute("insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)",
               (org["id"], team, org["max"].id))
    db.execute("update department set head_id = %s where id = %s", (org["max"].id, dept))
    db.execute("update team set lead_id = %s where id = %s", (org["max"].id, team))
    prd = org_prd(db, org["id"], org["mia"], "Mia's PRD")
    add_to_prd(db, prd, org["max"], "editor")
    assert patch(org, "ada", "max", active=False).status_code == 200
    assert db.execute("select head_id from department where id = %s", (dept,)).fetchone()[0] is None
    assert db.execute("select lead_id from team where id = %s", (team,)).fetchone()[0] is None
    assert org["max"].api("GET", f"/prds/{prd}").status_code == 404


def test_reactivation_restores_access_unless_active_elsewhere(org, db):
    prd = org_prd(db, org["id"], org["mia"], "Mia's PRD")
    add_to_prd(db, prd, org["max"], "viewer")
    patch(org, "ada", "max", active=False)
    r = patch(org, "ada", "max", active=True)
    assert r.status_code == 200 and r.json()["active"] is True
    assert org["max"].api("GET", f"/prds/{prd}").status_code == 200
    patch(org, "ada", "moe", active=False)
    db.execute("insert into organization_member (organization_id, user_id) values (%s, %s)", (org["other"], org["moe"].id))
    r = patch(org, "ada", "moe", active=True)
    assert r.status_code == 409 and r.json()["code"] == "active_elsewhere"


def test_members_cant_change_memberships_through_the_data_api(org, db):
    r = org["mia"].rest("PATCH", f"organization_member?organization_id=eq.{org['id']}&user_id=eq.{org['mia'].id}",
                        json={"access_role": "admin"})
    assert r.status_code in (401, 403) or r.json() == []
    r = org["mia"].rest("POST", "rpc/update_org_member", json={"target_org": org["id"], "target_user": org["mia"].id,
                                                               "changes": {"access_role": "admin"}})
    assert r.status_code >= 400
    assert member(db, org, "mia")[1] == "member"
