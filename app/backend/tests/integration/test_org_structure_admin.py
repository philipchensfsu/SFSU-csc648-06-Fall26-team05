"""E02 part 1: org admins create, rename and archive departments and teams, pick
heads and leads, and put people on teams. The directory's end-state rules hold."""

import pytest


@pytest.fixture
def org(make_user, make_org):
    """Ada is the admin; Mia and Max are members; Oz runs another organization."""
    ada, mia, max_, oz = (make_user() for _ in range(4))
    org_id = make_org(ada, mia, max_)
    other = make_org(oz)
    return dict(ada=ada, mia=mia, max=max_, oz=oz, id=org_id, other=other)


def path(org, rest=""):
    return f"/organizations/{org['id']}{rest}"


def create_department(org, name="Product", who="ada"):
    return org[who].api("POST", path(org, "/departments"), json={"name": name})


def create_team(org, name="Growth", department_id=None, who="ada"):
    return org[who].api("POST", path(org, "/teams"), json={"name": name, "department_id": department_id})


def directory(org, who="mia"):
    r = org[who].api("GET", path(org, "/directory"))
    assert r.status_code == 200, r.text
    return r.json()


def join_department(db, org, user, department_id):
    db.execute("update organization_member set department_id = %s where organization_id = %s and user_id = %s",
               (department_id, org["id"], user.id))


def test_admins_create_departments_and_teams_members_see_them(org):
    r = create_department(org, "  Product  ")
    assert r.status_code == 201, r.text
    dept = r.json()
    assert dept["name"] == "Product" and dept["head_id"] is None and dept["archived"] is False
    r = create_team(org, "Growth", dept["id"])
    assert r.status_code == 201, r.text
    team = r.json()
    assert team["department_id"] == dept["id"] and team["lead_id"] is None
    loose = create_team(org, "Tiger team").json()
    assert loose["department_id"] is None
    seen = directory(org)
    assert [d["id"] for d in seen["departments"]] == [dept["id"]]
    assert {t["id"] for t in seen["teams"]} == {team["id"], loose["id"]}


def test_members_get_403_and_outsiders_404(org):
    dept = create_department(org).json()
    team = create_team(org).json()
    for who, status in (("mia", 403), ("oz", 404)):
        calls = [
            org[who].api("POST", path(org, "/departments"), json={"name": "Sales"}),
            org[who].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"name": "X"}),
            org[who].api("POST", path(org, "/teams"), json={"name": "Ops"}),
            org[who].api("PATCH", path(org, f"/teams/{team['id']}"), json={"name": "X"}),
            org[who].api("PUT", path(org, f"/teams/{team['id']}/members/{org['mia'].id}")),
            org[who].api("DELETE", path(org, f"/teams/{team['id']}/members/{org['mia'].id}")),
        ]
        assert [r.status_code for r in calls] == [status] * 6, who


def test_names_are_checked(org):
    for bad in ("", "   ", "x" * 101):
        assert create_department(org, bad).status_code == 422
    create_department(org, "Product")
    r = create_department(org, "PRODUCT")
    assert r.status_code == 409 and r.json()["code"] == "name_taken"
    create_team(org, "Growth")
    assert create_team(org, "growth").json()["code"] == "name_taken"
    dept = create_department(org, "Sales").json()
    r = org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"name": None})
    assert r.status_code == 422


def test_rename_and_archive_frees_the_name(org):
    dept = create_department(org, "Product").json()
    r = org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"name": "Platform"})
    assert r.status_code == 200 and r.json()["name"] == "Platform"
    r = org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"archived": True})
    assert r.status_code == 200 and r.json()["archived"] is True
    assert create_department(org, "Platform").status_code == 201
    # Unarchiving now clashes with the new active "Platform".
    r = org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"archived": False})
    assert r.status_code == 409 and r.json()["code"] == "name_taken"


def test_a_head_must_be_in_the_department(org, db):
    dept = create_department(org).json()
    r = org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"head_id": org["mia"].id})
    assert r.status_code == 422 and r.json()["code"] == "head_not_in_department"
    join_department(db, org, org["mia"], dept["id"])
    r = org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"head_id": org["mia"].id})
    assert r.status_code == 200 and r.json()["head_id"] == org["mia"].id
    r = org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"head_id": None})
    assert r.status_code == 200 and r.json()["head_id"] is None


def test_a_head_from_another_org_is_refused(org):
    dept = create_department(org).json()
    r = org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"head_id": org["oz"].id})
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"


def test_departments_with_people_or_teams_cant_be_archived(org, db):
    dept = create_department(org).json()
    join_department(db, org, org["mia"], dept["id"])
    r = org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"archived": True})
    assert r.status_code == 409 and r.json()["code"] == "department_not_empty"
    join_department(db, org, org["mia"], None)
    team = create_team(org, "Growth", dept["id"]).json()
    assert org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"),
                          json={"archived": True}).json()["code"] == "department_not_empty"
    org["ada"].api("PATCH", path(org, f"/teams/{team['id']}"), json={"department_id": None})
    assert org["ada"].api("PATCH", path(org, f"/departments/{dept['id']}"), json={"archived": True}).status_code == 200


def test_teams_move_between_departments_in_the_same_org(org, make_user):
    a, b = create_department(org, "A").json(), create_department(org, "B").json()
    team = create_team(org, "Growth", a["id"]).json()
    r = org["ada"].api("PATCH", path(org, f"/teams/{team['id']}"), json={"department_id": b["id"]})
    assert r.status_code == 200 and r.json()["department_id"] == b["id"]
    foreign = org["oz"].api("POST", f"/organizations/{org['other']}/departments", json={"name": "Theirs"}).json()
    r = org["ada"].api("PATCH", path(org, f"/teams/{team['id']}"), json={"department_id": foreign["id"]})
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"
    assert create_team(org, "Other", foreign["id"]).json()["code"] == "not_in_organization"


def test_team_membership_and_leads(org):
    team = create_team(org).json()
    add = path(org, f"/teams/{team['id']}/members/{org['mia'].id}")
    assert org["ada"].api("PUT", add).status_code == 204
    assert org["ada"].api("PUT", add).status_code == 204  # already on it
    member = next(m for m in directory(org)["members"] if m["user_id"] == org["mia"].id)
    assert member["team_ids"] == [team["id"]]
    r = org["ada"].api("PATCH", path(org, f"/teams/{team['id']}"), json={"lead_id": org["max"].id})
    assert r.status_code == 422 and r.json()["code"] == "lead_not_in_team"
    r = org["ada"].api("PATCH", path(org, f"/teams/{team['id']}"), json={"lead_id": org["mia"].id})
    assert r.status_code == 200 and r.json()["lead_id"] == org["mia"].id
    # The lead has to be replaced or cleared before leaving the team.
    assert org["ada"].api("DELETE", add).json()["code"] == "lead_not_in_team"
    org["ada"].api("PATCH", path(org, f"/teams/{team['id']}"), json={"lead_id": None})
    assert org["ada"].api("DELETE", add).status_code == 204
    assert org["ada"].api("DELETE", add).status_code == 204  # already off it
    member = next(m for m in directory(org)["members"] if m["user_id"] == org["mia"].id)
    assert member["team_ids"] == [] and member["access_role"] == "member"


def test_only_active_members_of_the_org_join_teams(org, db):
    team = create_team(org).json()
    r = org["ada"].api("PUT", path(org, f"/teams/{team['id']}/members/{org['oz'].id}"))
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"
    db.execute("update organization_member set active = false where user_id = %s", (org["max"].id,))
    r = org["ada"].api("PUT", path(org, f"/teams/{team['id']}/members/{org['max'].id}"))
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"


def test_archived_teams_take_no_members_and_full_teams_cant_be_archived(org):
    team = create_team(org).json()
    org["ada"].api("PUT", path(org, f"/teams/{team['id']}/members/{org['mia'].id}"))
    r = org["ada"].api("PATCH", path(org, f"/teams/{team['id']}"), json={"archived": True})
    assert r.status_code == 409 and r.json()["code"] == "team_not_empty"
    org["ada"].api("DELETE", path(org, f"/teams/{team['id']}/members/{org['mia'].id}"))
    assert org["ada"].api("PATCH", path(org, f"/teams/{team['id']}"), json={"archived": True}).status_code == 200
    r = org["ada"].api("PUT", path(org, f"/teams/{team['id']}/members/{org['max'].id}"))
    assert r.status_code == 409 and r.json()["code"] == "team_archived"


def test_another_orgs_units_are_404(org):
    foreign_dept = org["oz"].api("POST", f"/organizations/{org['other']}/departments", json={"name": "Theirs"}).json()
    foreign_team = org["oz"].api("POST", f"/organizations/{org['other']}/teams", json={"name": "Theirs"}).json()
    assert org["ada"].api("PATCH", path(org, f"/departments/{foreign_dept['id']}"), json={"name": "X"}).status_code == 404
    assert org["ada"].api("PATCH", path(org, f"/teams/{foreign_team['id']}"), json={"name": "X"}).status_code == 404
    assert org["ada"].api("PUT", path(org, f"/teams/{foreign_team['id']}/members/{org['mia'].id}")).status_code == 404


def test_the_data_api_enforces_the_same_rules(org):
    r = org["mia"].rest("POST", "department", json={"organization_id": org["id"], "name": "Sneaky"})
    assert r.status_code in (401, 403)
    r = org["ada"].rest("POST", "department", json={"organization_id": org["other"], "name": "Sneaky"})
    assert r.status_code in (401, 403)
    dept = create_department(org).json()
    r = org["ada"].rest("PATCH", f"department?id=eq.{dept['id']}", json={"organization_id": org["other"]})
    assert r.status_code in (401, 403)
    r = org["ada"].rest("DELETE", f"department?id=eq.{dept['id']}")
    assert r.status_code in (401, 403) or r.json() == []
    assert [d["id"] for d in directory(org)["departments"]] == [dept["id"]]
