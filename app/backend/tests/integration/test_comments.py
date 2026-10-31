"""E06: flat comments on a PRD's current saved version. Anyone who can view the
PRD comments; owners and editors are notified; attribution is frozen at posting."""

import pytest

from conftest import add_to_prd, org_prd, save_version


@pytest.fixture
def team(make_user, make_org, db):
    """Ada is the org admin; Olive owns the PRD; Ed edits it; Vic views it; Nia is in the org but not on it."""
    ada, olive, ed, vic, nia = (make_user() for _ in range(5))
    org = make_org(ada, olive, ed, vic, nia)
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    add_to_prd(db, prd, vic, "viewer")
    db.execute("update profile set full_name = 'Vic Viewer' where id = %s", (vic.id,))
    dept = db.execute("insert into department (organization_id, name) values (%s, 'Design') returning id::text",
                      (org,)).fetchone()[0]
    db.execute("update organization_member set department_id = %s where user_id = %s", (dept, vic.id))
    version = save_version(db, prd, olive)
    return dict(ada=ada, olive=olive, ed=ed, vic=vic, nia=nia, org=org, prd=prd, version=version, dept=dept)


def post(user, prd, version, body="Looks good", section=None):
    return user.api("POST", f"/prds/{prd}/comments", json={"version_id": version, "section_type": section, "body": body})


def comments(user, prd, **params):
    r = user.api("GET", f"/prds/{prd}/comments", params=params)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("who", ["olive", "ed", "vic", "ada"])
def test_anyone_who_can_view_the_prd_can_comment(team, who):
    r = post(team[who], team["prd"], team["version"], "Ship it", "goals")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["prd_id"] == team["prd"] and body["version_id"] == team["version"] and body["version_no"] == 1
    assert body["section_type"] == "goals" and body["body"] == "Ship it" and body["author"]["id"] == team[who].id
    assert comments(team["vic"], team["prd"])["items"] == [body]


def test_attribution_is_frozen_at_posting(team, db):
    post(team["vic"], team["prd"], team["version"])
    db.execute("update profile set full_name = 'Renamed' where id = %s", (team["vic"].id,))
    db.execute("update organization_member set department_id = null where user_id = %s", (team["vic"].id,))
    [item] = comments(team["olive"], team["prd"])["items"]
    assert item["author"] == {"id": team["vic"].id, "name": "Vic Viewer", "department": "Design"}


def test_people_who_cant_see_the_prd_get_404(team, make_user):
    for user in (team["nia"], make_user()):
        assert post(user, team["prd"], team["version"]).status_code == 404
        r = user.api("GET", f"/prds/{team['prd']}/comments")
        assert r.status_code == 404 and r.json()["code"] == "not_found"


def test_losing_access_hides_comments(team, db):
    post(team["olive"], team["prd"], team["version"])
    db.execute("delete from prd_member where prd_id = %s and user_id = %s", (team["prd"], team["vic"].id))
    assert team["vic"].api("GET", f"/prds/{team['prd']}/comments").status_code == 404
    assert team["vic"].rest("GET", f"prd_comment?prd_id=eq.{team['prd']}").json() == []


def test_comments_need_a_saved_version(team, db):
    prd = org_prd(db, team["org"], team["olive"], "Unsaved")
    r = post(team["olive"], prd, team["version"])
    assert r.status_code == 409 and r.json()["code"] == "no_saved_version"


def test_comments_on_an_old_version_are_refused_but_stay_readable(team, db):
    post(team["vic"], team["prd"], team["version"], "On v1")
    v2 = save_version(db, team["prd"], team["olive"])
    r = post(team["vic"], team["prd"], team["version"], "Late")
    assert r.status_code == 409 and r.json()["code"] == "stale_version"
    assert post(team["vic"], team["prd"], v2, "On v2").status_code == 201
    every = comments(team["vic"], team["prd"])["items"]
    assert [(c["body"], c["version_no"]) for c in every] == [("On v1", 1), ("On v2", 2)]
    assert [c["body"] for c in comments(team["vic"], team["prd"], version_id=v2)["items"]] == ["On v2"]


def test_a_version_of_another_prd_is_refused(team, db):
    other = org_prd(db, team["org"], team["olive"], "Other")
    other_version = save_version(db, other, team["olive"])
    r = post(team["olive"], team["prd"], other_version)
    assert r.status_code == 409 and r.json()["code"] == "stale_version"


@pytest.mark.parametrize("body, section", [("", None), ("   ", None), ("x" * 5001, None), ("Fine", "intro")])
def test_body_and_section_are_validated(team, body, section):
    r = post(team["olive"], team["prd"], team["version"], body, section)
    assert r.status_code == 422 and r.json()["code"] == "validation_error"


def test_the_longest_body_is_accepted(team):
    assert post(team["olive"], team["prd"], team["version"], "x" * 5000).status_code == 201


def test_a_comment_notifies_owners_and_editors_once(team, db):
    comment = post(team["vic"], team["prd"], team["version"], section="risks").json()
    event = db.execute("select event_type, actor_id::text, payload, version_id::text, comment_id::text "
                       "from prd_event where prd_id = %s", (team["prd"],)).fetchall()
    assert event == [("comment_added", team["vic"].id, {"section_type": "risks"}, team["version"], comment["id"])]
    for who, expected in (("olive", 1), ("ed", 1), ("vic", 0), ("ada", 0)):
        inbox = team[who].api("GET", "/notifications").json()
        assert inbox["unread_count"] == expected, who
    item = team["olive"].api("GET", "/notifications").json()["items"][0]
    assert item["type"] == "comment_added" and item["comment_id"] == comment["id"]
    assert item["version_id"] == team["version"]


def test_comments_dont_change_the_prd(team, db):
    before = db.execute("select revision, current_version_id, status from prd where id = %s", (team["prd"],)).fetchone()
    post(team["olive"], team["prd"], team["version"])
    after = db.execute("select revision, current_version_id, status from prd where id = %s", (team["prd"],)).fetchone()
    assert after == before


def test_comments_page_oldest_first(team):
    for n in range(3):
        post(team["olive"], team["prd"], team["version"], f"Comment {n}")
    page1 = comments(team["olive"], team["prd"], limit=2)
    assert [c["body"] for c in page1["items"]] == ["Comment 0", "Comment 1"]
    page2 = comments(team["olive"], team["prd"], limit=2, cursor=page1["next_cursor"])
    assert [c["body"] for c in page2["items"]] == ["Comment 2"] and page2["next_cursor"] is None


def test_clients_cant_write_comments_directly(team):
    r = team["vic"].rest("POST", "prd_comment", json={"prd_id": team["prd"], "version_id": team["version"], "body": "x"})
    assert r.status_code in (401, 403)


def test_the_section_list_matches_the_document_format(db):
    import prd_document
    definition = db.execute("select pg_get_constraintdef(oid) from pg_constraint "
                            "where conrelid = 'prd_comment'::regclass and conname = 'prd_comment_section_type_check'"
                            ).fetchone()[0]
    for section_type in prd_document.section_types():
        assert f"'{section_type}'" in definition
