"""E07: submitting a PRD's current version for review. Owners and org admins pick
reviewers from the org; the round freezes them; the PRD moves to in_review."""

from concurrent.futures import ThreadPoolExecutor

import pytest

from conftest import EMPTY_DOC, add_to_prd, org_prd, save_version


@pytest.fixture
def team(make_user, make_org, db):
    """Ada is the org admin; Olive owns the PRD; Ed edits it; Vic views it; Nia is in the org but not on it."""
    ada, olive, ed, vic, nia = (make_user() for _ in range(5))
    org = make_org(ada, olive, ed, vic, nia)
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    add_to_prd(db, prd, vic, "viewer")
    db.execute("update profile set full_name = 'Nia New' where id = %s", (nia.id,))
    dept = db.execute("insert into department (organization_id, name) values (%s, 'Design') returning id::text",
                      (org,)).fetchone()[0]
    db.execute("update organization_member set department_id = %s where user_id = %s", (dept, nia.id))
    version = save_version(db, prd, olive)
    return dict(ada=ada, olive=olive, ed=ed, vic=vic, nia=nia, org=org, prd=prd, version=version)


def prd_row(db, prd):
    return db.execute("select revision, status, current_version_id::text from prd where id = %s", (prd,)).fetchone()


def submit(user, prd, db, reviewers, version=None):
    revision, _, current = prd_row(db, prd)
    return user.api("POST", f"/prds/{prd}/reviews", json={
        "revision": revision, "version_id": version or current, "reviewer_ids": [r.id for r in reviewers]})


def rounds(db, prd):
    return db.execute("select round_no, state from review_round where prd_id = %s order by round_no", (prd,)).fetchall()


@pytest.mark.parametrize("who", ["olive", "ada"])
def test_owners_and_org_admins_submit(team, db, who):
    r = submit(team[who], team["prd"], db, [team["ed"], team["nia"], team["ed"]])
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "in_review" and body["revision"] == prd_row(db, team["prd"])[0]
    rnd = body["round"]
    assert rnd["round_no"] == 1 and rnd["state"] == "in_review" and rnd["version_id"] == team["version"]
    assert rnd["version_no"] == 1 and rnd["submitted_by"] == team[who].id and rnd["owner_review_allowed"] is False
    assert {(x["user_id"], x["state"]) for x in rnd["reviewers"]} == {(team["ed"].id, "pending"), (team["nia"].id, "pending")}
    nia = next(x for x in rnd["reviewers"] if x["user_id"] == team["nia"].id)
    assert nia["name"] == "Nia New" and nia["department"] == "Design"
    assert prd_row(db, team["prd"])[1] == "in_review"


def test_reviewers_not_on_the_prd_become_viewers_and_are_notified(team, db):
    rnd = submit(team["olive"], team["prd"], db, [team["ed"], team["nia"]]).json()["round"]
    roles = dict(db.execute("select user_id::text, role from prd_member where prd_id = %s", (team["prd"],)).fetchall())
    assert roles[team["nia"].id] == "viewer" and roles[team["ed"].id] == "editor"
    assert team["nia"].api("GET", f"/prds/{team['prd']}").status_code == 200
    for who, expected in (("ed", 1), ("nia", 1), ("olive", 0), ("vic", 0), ("ada", 0)):
        assert team[who].api("GET", "/notifications").json()["unread_count"] == expected, who
    item = team["nia"].api("GET", "/notifications").json()["items"][0]
    assert item["type"] == "submitted" and item["round_id"] == rnd["id"] and item["version_id"] == team["version"]
    assert item["payload"] == {"round_no": 1, "resubmitted": False}


@pytest.mark.parametrize("who", ["ed", "vic"])
def test_editors_and_viewers_cant_submit(team, db, who):
    r = submit(team[who], team["prd"], db, [team["nia"]])
    assert r.status_code == 403 and r.json()["code"] == "forbidden"
    assert rounds(db, team["prd"]) == []


def test_people_who_cant_see_the_prd_get_404(team, db, make_user):
    assert submit(team["nia"], team["prd"], db, [team["ed"]]).status_code == 404
    assert submit(make_user(), team["prd"], db, [team["ed"]]).status_code == 404
    assert make_user().api("GET", f"/prds/{team['prd']}/reviews").status_code == 404


def test_stale_revision_and_version_are_refused(team, db):
    old = team["version"]
    save_version(db, team["prd"], team["olive"])
    r = submit(team["olive"], team["prd"], db, [team["ed"]], version=old)
    assert r.status_code == 409 and r.json()["code"] == "stale_version"
    r = team["olive"].api("POST", f"/prds/{team['prd']}/reviews",
                          json={"revision": 1, "version_id": old, "reviewer_ids": [team["ed"].id]})
    assert r.status_code == 409 and r.json()["code"] == "stale_revision"


def test_unsaved_and_empty_prds_cant_be_submitted(team, db):
    unsaved = org_prd(db, team["org"], team["olive"], "Unsaved")
    r = team["olive"].api("POST", f"/prds/{unsaved}/reviews",
                          json={"revision": 1, "version_id": team["version"], "reviewer_ids": [team["ed"].id]})
    assert r.status_code == 409 and r.json()["code"] == "no_saved_version"
    save_version(db, team["prd"], team["olive"], EMPTY_DOC)
    r = submit(team["olive"], team["prd"], db, [team["ed"]])
    assert r.status_code == 422 and r.json()["code"] == "empty_prd"


def test_reviewers_must_be_active_members_of_the_org(team, db, make_user):
    outsider = make_user()
    r = submit(team["olive"], team["prd"], db, [team["nia"], outsider])
    assert r.status_code == 422 and r.json()["code"] == "not_in_organization"
    db.execute("update organization_member set active = false where user_id = %s", (team["ed"].id,))
    assert submit(team["olive"], team["prd"], db, [team["ed"]]).json()["code"] == "not_in_organization"
    # Nothing from the refused submissions stuck.
    assert rounds(db, team["prd"]) == [] and prd_row(db, team["prd"])[1] == "draft"
    assert db.execute("select count(*) from prd_member where prd_id = %s and user_id = %s",
                      (team["prd"], team["nia"].id)).fetchone()[0] == 0


def test_an_empty_reviewer_list_is_a_422(team, db):
    r = submit(team["olive"], team["prd"], db, [])
    assert r.status_code == 422 and r.json()["code"] == "validation_error"


def test_owners_cant_review_their_own_prd(team, db):
    add_to_prd(db, team["prd"], team["nia"], "owner")
    for reviewers in ([team["olive"]], [team["nia"], team["ed"]]):
        r = submit(team["olive"], team["prd"], db, reviewers)
        assert r.status_code == 422 and r.json()["code"] == "owner_cannot_review"


def test_in_a_one_person_org_the_owner_reviews_and_keeps_that_when_someone_joins(make_user, make_org, db):
    solo = make_user()
    org = make_org(solo)
    prd = org_prd(db, org, solo, "Solo PRD")
    save_version(db, prd, solo)
    r = submit(solo, prd, db, [solo])
    assert r.status_code == 201, r.text
    assert r.json()["round"]["owner_review_allowed"] is True
    newcomer = make_user()
    db.execute("delete from organization where created_by = %s", (newcomer.id,))
    db.execute("insert into organization_member (organization_id, user_id) values (%s, %s)", (org, newcomer.id))
    [rnd] = solo.api("GET", f"/prds/{prd}/reviews").json()["items"]
    assert rnd["owner_review_allowed"] is True and [x["user_id"] for x in rnd["reviewers"]] == [solo.id]


def test_one_review_at_a_time_until_its_superseded(team, db):
    assert submit(team["olive"], team["prd"], db, [team["ed"]]).status_code == 201
    for state in ("in_review", "changes_requested", "approved"):
        db.execute("update review_round set state = %s where prd_id = %s", (state, team["prd"]))
        r = submit(team["olive"], team["prd"], db, [team["ed"]])
        assert r.status_code == 409 and r.json()["code"] == "review_in_progress"
    db.execute("update review_round set state = 'superseded' where prd_id = %s", (team["prd"],))
    save_version(db, team["prd"], team["olive"])
    assert submit(team["olive"], team["prd"], db, [team["vic"]]).status_code == 201
    assert rounds(db, team["prd"]) == [(1, "superseded"), (2, "in_review")]
    listed = team["vic"].api("GET", f"/prds/{team['prd']}/reviews").json()
    assert [(x["round_no"], x["state"], x["version_no"]) for x in listed["items"]] == [
        (2, "in_review", 2), (1, "superseded", 1)]


def test_simultaneous_submissions_open_one_round(team, db):
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: submit(team["olive"], team["prd"], db, [team["ed"]]).status_code, range(2)))
    assert sorted(results) == [201, 409]
    assert rounds(db, team["prd"]) == [(1, "in_review")]


def test_the_reviewer_list_is_frozen(team, db):
    submit(team["olive"], team["prd"], db, [team["ed"], team["nia"]])
    db.execute("update organization_member set active = false where user_id = %s", (team["nia"].id,))
    db.execute("delete from prd_member where prd_id = %s and user_id = %s", (team["prd"], team["ed"].id))
    [rnd] = team["olive"].api("GET", f"/prds/{team['prd']}/reviews").json()["items"]
    assert {x["user_id"] for x in rnd["reviewers"]} == {team["ed"].id, team["nia"].id}


def test_clients_cant_write_rounds_or_open_them_directly(team, db):
    r = team["olive"].rest("POST", "review_round", json={"prd_id": team["prd"], "round_no": 1,
                                                         "version_id": team["version"]})
    assert r.status_code in (401, 403)
    r = team["olive"].rest("POST", "rpc/open_review_round",
                           json={"p_prd_id": team["prd"], "p_actor": team["olive"].id, "p_reviewers": [team["ed"].id]})
    assert r.status_code in (401, 403, 404)
    assert rounds(db, team["prd"]) == []


def test_round_approved_and_superseded_notify_the_right_reviewers(team, db):
    rnd = submit(team["olive"], team["prd"], db, [team["ed"], team["nia"]]).json()["round"]["id"]
    db.execute("select record_prd_event(%s, 'round_approved', %s, '{}', null, %s)", (team["prd"], team["nia"].id, rnd))
    db.execute("select record_prd_event(%s, 'superseded', %s, %s::jsonb, null, %s)",
               (team["prd"], team["olive"].id, f'{{"reviewer_ids": ["{team["nia"].id}"]}}', rnd))
    def types(who):
        return [i["type"] for i in team[who].api("GET", "/notifications").json()["items"]]
    assert types("olive") == ["round_approved"]
    assert types("ed") == ["round_approved", "submitted"]
    assert types("nia") == ["superseded", "submitted"]
