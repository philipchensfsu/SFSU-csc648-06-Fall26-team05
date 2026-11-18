"""E13: a PRD's activity feed. Newest first, paged, filterable by type, with the
actor and a readable summary, and only for people who can view the PRD."""

import pytest

from conftest import add_to_prd, org_prd


@pytest.fixture
def team(make_user, make_org, db):
    """Ada is the org admin; Olive owns the PRD; Vic views it; Nia is in the org but not on it."""
    ada, olive, vic, nia = (make_user() for _ in range(4))
    org = make_org(ada, olive, vic, nia)
    for user, name in ((olive, "Olive Owner"), (nia, "Nia New")):
        db.execute("update profile set full_name = %s where id = %s", (name, user.id))
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, vic, "viewer")
    return dict(ada=ada, olive=olive, vic=vic, nia=nia, org=org, prd=prd)


def record(db, prd, event_type, actor, payload="{}", at=None):
    """Records an event; `at` (seconds ago) fixes created_at so the order doesn't depend on timing."""
    event = db.execute("select record_prd_event(%s, %s, %s, %s::jsonb)",
                       (prd, event_type, actor.id if actor else None, payload)).fetchone()[0]
    if at is not None:
        db.execute("update prd_event set created_at = now() - make_interval(secs => %s) where id = %s", (at, event))
    return str(event)


def feed(user, prd, **params):
    r = user.api("GET", f"/prds/{prd}/events", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_the_feed_is_newest_first_with_actor_and_summary(team, db):
    olive, prd = team["olive"], team["prd"]
    first = record(db, prd, "comment_added", olive, '{"section_type": "goals"}', at=30)
    second = record(db, prd, "member_added", olive, f'{{"user_id": "{team["nia"].id}", "role": "editor"}}', at=20)
    body = feed(team["vic"], prd)
    assert body["next_cursor"] is None
    assert [e["id"] for e in body["items"]] == [second, first]
    added = body["items"][0]
    assert added["type"] == "member_added"
    assert added["actor"] == {"id": olive.id, "name": "Olive Owner"}
    assert added["summary"] == "Olive Owner added Nia New as an editor"
    assert added["payload"] == {"user_id": team["nia"].id, "role": "editor"}
    assert body["items"][1]["summary"] == "Olive Owner commented on Goals"


def test_real_actions_show_up(team, db):
    olive, prd, nia = team["olive"], team["prd"], team["nia"]
    assert olive.api("PUT", f"/prds/{prd}/members/{nia.id}", json={"role": "viewer"}).status_code == 200
    [event] = feed(olive, prd)["items"]
    assert event["summary"] == "Olive Owner added Nia New as a viewer"


def test_the_feed_pages_with_a_cursor(team, db):
    prd = team["prd"]
    ids = [record(db, prd, "comment_added", team["olive"], at=60 - i) for i in range(3)]
    page1 = feed(team["olive"], prd, limit=2)
    assert [e["id"] for e in page1["items"]] == ids[:0:-1]
    page2 = feed(team["olive"], prd, limit=2, cursor=page1["next_cursor"])
    assert [e["id"] for e in page2["items"]] == [ids[0]] and page2["next_cursor"] is None


def test_type_filters_the_feed(team, db):
    prd, olive = team["prd"], team["olive"]
    comment = record(db, prd, "comment_added", olive, at=30)
    approval = record(db, prd, "approved", olive, '{"round_no": 1}', at=20)
    record(db, prd, "work_status_changed", olive, '{"from": "not_started", "to": "in_progress"}', at=10)
    assert [e["id"] for e in feed(olive, prd, type="comment_added")["items"]] == [comment]
    both = feed(olive, prd, type=["approved", "comment_added"])["items"]
    assert [e["id"] for e in both] == [approval, comment]
    r = olive.api("GET", f"/prds/{prd}/events", params={"type": "not_a_type"})
    assert r.status_code == 422 and r.json()["code"] == "validation_error"


def test_system_actions_have_no_actor(team, db):
    record(db, team["prd"], "comment_added", None)
    [event] = feed(team["olive"], team["prd"])["items"]
    assert event["actor"] is None and event["summary"] == "Nautilus commented"


def test_admins_see_it_and_people_off_the_prd_get_404(team, make_user, db):
    record(db, team["prd"], "comment_added", team["olive"])
    assert len(feed(team["ada"], team["prd"])["items"]) == 1
    for user in (team["nia"], make_user()):
        r = user.api("GET", f"/prds/{team['prd']}/events")
        assert r.status_code == 404 and r.json()["code"] == "not_found"


def test_a_bad_cursor_is_400(team):
    r = team["olive"].api("GET", f"/prds/{team['prd']}/events", params={"cursor": "nope"})
    assert r.status_code == 400 and r.json()["code"] == "invalid_cursor"
