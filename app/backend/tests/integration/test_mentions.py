"""Feature 07: @mentions in comments. Only people who can view the PRD can be
mentioned; they get one immediate mentioned notification instead of the
batched comment one."""

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
    for user, name in ((ed, "Ed Editor"), (vic, "Vic Viewer")):
        db.execute("update profile set full_name = %s where id = %s", (name, user.id))
    version = save_version(db, prd, olive)
    return dict(ada=ada, olive=olive, ed=ed, vic=vic, nia=nia, org=org, prd=prd, version=version)


def post(user, team, mentions, body="Take a look", section="goals"):
    return user.api("POST", f"/prds/{team['prd']}/comments",
                    json={"version_id": team["version"], "section_type": section, "body": body, "mentions": mentions})


def notifications(db, prd):
    return sorted(db.execute("select e.event_type, n.recipient_id::text from notification n "
                             "join prd_event e on e.id = n.event_id where n.prd_id = %s", (prd,)).fetchall())


def test_a_mention_is_stored_and_returned_with_the_name(team, db):
    r = post(team["olive"], team, [team["vic"].id])
    assert r.status_code == 201, r.text
    assert r.json()["mentions"] == [{"id": team["vic"].id, "name": "Vic Viewer"}]
    db.execute("update profile set full_name = 'Renamed' where id = %s", (team["vic"].id,))
    [listed] = team["ed"].api("GET", f"/prds/{team['prd']}/comments").json()["items"]
    assert listed["mentions"] == [{"id": team["vic"].id, "name": "Vic Viewer"}]


def test_mentioned_people_get_one_mentioned_notification_instead_of_the_comment_one(team, db):
    # Ed (an editor) would normally get comment_added; mentioned, he gets only mentioned.
    post(team["olive"], team, [team["ed"].id, team["vic"].id])
    assert notifications(db, team["prd"]) == sorted([("mentioned", team["ed"].id), ("mentioned", team["vic"].id)])
    post(team["vic"], team, [team["ed"].id])
    assert sorted(notifications(db, team["prd"])) == sorted([
        ("mentioned", team["ed"].id), ("mentioned", team["vic"].id),
        ("mentioned", team["ed"].id), ("comment_added", team["olive"].id)])


def test_mentions_are_never_batched(team, db):
    post(team["olive"], team, [team["vic"].id])
    post(team["olive"], team, [team["vic"].id])
    r = team["vic"].api("GET", "/notifications")
    assert [(i["type"], i["count"]) for i in r.json()["items"]] == [("mentioned", 1), ("mentioned", 1)]


def test_the_feed_shows_the_comment_and_the_mention(team, db):
    post(team["ed"], team, [team["vic"].id])
    items = team["olive"].api("GET", f"/prds/{team['prd']}/events").json()["items"]
    assert sorted(e["summary"] for e in items) == [
        "Ed Editor commented on Goals", "Ed Editor mentioned Vic Viewer in a comment on Goals"]


def test_people_who_cant_see_the_prd_cant_be_mentioned(team, make_user, db):
    for outsider in (team["nia"].id, make_user().id):
        r = post(team["olive"], team, [team["vic"].id, outsider])
        assert r.status_code == 422 and r.json()["code"] == "mention_without_access"
    assert db.execute("select count(*) from prd_comment where prd_id = %s", (team["prd"],)).fetchone()[0] == 0
    assert notifications(db, team["prd"]) == []


def test_org_admins_and_yourself_can_be_mentioned(team, db):
    assert post(team["vic"], team, [team["ada"].id, team["vic"].id, team["vic"].id]).status_code == 201
    # A self-mention is stored once and notifies no one.
    assert db.execute("select count(*) from prd_comment_mention where user_id = %s", (team["vic"].id,)).fetchone()[0] == 1
    assert ("mentioned", team["ada"].id) in notifications(db, team["prd"])
    assert ("mentioned", team["vic"].id) not in notifications(db, team["prd"])


def test_no_mentions_works_as_before(team, db):
    r = team["vic"].api("POST", f"/prds/{team['prd']}/comments",
                        json={"version_id": team["version"], "section_type": None, "body": "Hi"})
    assert r.status_code == 201 and r.json()["mentions"] == []
    assert notifications(db, team["prd"]) == sorted([("comment_added", team["olive"].id),
                                                    ("comment_added", team["ed"].id)])


def test_too_many_mentions_are_rejected(team, db):
    r = post(team["olive"], team, [team["vic"].id] * 21)
    assert r.status_code == 422 and r.json()["code"] == "validation_error"


def test_mentions_are_hidden_with_the_prd(team, db):
    post(team["olive"], team, [team["vic"].id])
    assert team["nia"].rest("GET", "/prd_comment_mention?select=user_id").json() == []
