"""S02: status, the version pointer and ownership can't be forged, through the API
or the Data API. Status changes only through review (Decision 6)."""

import pytest

from conftest import add_to_prd, org_prd


@pytest.fixture
def team(make_user, make_org, db):
    """Olive owns the PRD; Ed edits it; Ada is the org admin."""
    ada, olive, ed = (make_user() for _ in range(3))
    org = make_org(ada, olive, ed)
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    return dict(ada=ada, olive=olive, ed=ed, org=org, prd=prd)


def row(db, prd):
    return db.execute("select status, revision, owner_id::text, current_version_id from prd where id = %s",
                      (prd,)).fetchone()


@pytest.mark.parametrize("status", ["draft", "in_review", "final"])
def test_saving_with_a_status_is_refused(team, db, status):
    before = row(db, team["prd"])
    r = team["olive"].api("PUT", f"/prds/{team['prd']}", json={"revision": 1, "title": "x", "status": status})
    assert r.status_code == 422 and r.json()["code"] == "status_not_allowed"
    assert row(db, team["prd"]) == before


def test_saving_without_a_status_still_works(team, db):
    # A title-only save works on both the legacy save and the S03 save (PRD_SAVE_V2).
    r = team["ed"].api("PUT", f"/prds/{team['prd']}", json={"revision": 1, "title": "Renamed"})
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Renamed" and r.json()["revision"] == 2 and r.json()["status"] == "draft"


@pytest.mark.parametrize("who", ["olive", "ed", "ada"])
@pytest.mark.parametrize("change", [
    {"status": "final"},
    {"current_version_id": "00000000-0000-0000-0000-000000000001"},
    {"created_at": "2000-01-01T00:00:00Z"},
])
def test_the_data_api_cant_forge_control_fields(team, db, who, change):
    before = row(db, team["prd"])
    r = team[who].rest("PATCH", f"prd?id=eq.{team['prd']}", json=change)
    assert r.status_code in (401, 403), r.text
    assert row(db, team["prd"]) == before


def test_the_data_api_cant_hand_a_prd_to_someone_else(team, db):
    r = team["olive"].rest("PATCH", f"prd?id=eq.{team['prd']}", json={"owner_id": team["ed"].id})
    assert r.status_code in (401, 403)
    assert row(db, team["prd"])[2] == team["olive"].id


def test_the_data_api_cant_create_a_prd_that_is_already_final(team):
    r = team["olive"].rest("POST", "prd", json={"title": "Pre-approved", "owner_id": team["olive"].id,
                                                "organization_id": team["org"], "status": "final"})
    assert r.status_code in (401, 403)


def test_content_edits_through_the_data_api_still_follow_roles(team, db):
    r = team["ed"].rest("PATCH", f"prd?id=eq.{team['prd']}", json={"title": "Direct", "revision": 2})
    assert r.status_code == 200 and r.json()[0]["title"] == "Direct"


def test_creating_a_prd_through_the_api_still_works(team):
    r = team["olive"].api("POST", "/prds", json={"title": "New PRD"})
    assert r.status_code == 201 and r.json()["status"] == "draft"
