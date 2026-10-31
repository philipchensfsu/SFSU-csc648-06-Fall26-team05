"""E10: PRD events and the inbox. One event per real change, notifications only
for the fixed recipients, hidden once access goes, and nothing a client can forge."""

import psycopg
import pytest

from conftest import add_to_prd, org_prd


@pytest.fixture
def team(make_user, make_org, db):
    """Ada is the org admin; Olive owns the PRD; Ed edits it; Vic views it; Nia is in the org but not on it."""
    ada, olive, ed, vic, nia = (make_user() for _ in range(5))
    org = make_org(ada, olive, ed, vic, nia)
    db.execute("update profile set full_name = 'Olive Owner' where id = %s", (olive.id,))
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    add_to_prd(db, prd, vic, "viewer")
    return dict(ada=ada, olive=olive, ed=ed, vic=vic, nia=nia, org=org, prd=prd)


def inbox(user, **params):
    r = user.api("GET", "/notifications", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def invite(by, prd, user, role="viewer"):
    r = by.api("PUT", f"/prds/{prd}/members/{user.id}", json={"role": role})
    assert r.status_code == 200, r.text


def events(db, prd):
    return db.execute("select event_type, payload from prd_event where prd_id = %s order by created_at",
                      (prd,)).fetchall()


def record(db, prd, event_type, actor, payload="{}"):
    db.execute("select record_prd_event(%s, %s, %s, %s::jsonb)", (prd, event_type, actor.id if actor else None, payload))


def test_an_invite_notifies_only_the_invited_person(team, db):
    invite(team["olive"], team["prd"], team["nia"], "editor")
    body = inbox(team["nia"])
    assert body["unread_count"] == 1 and body["next_cursor"] is None
    [item] = body["items"]
    assert item["type"] == "member_added" and item["prd_id"] == team["prd"] and item["title"] == "Team PRD"
    assert item["actor_id"] == team["olive"].id and item["actor_name"] == "Olive Owner"
    assert item["payload"] == {"user_id": team["nia"].id, "role": "editor"} and item["read_at"] is None
    for other in ("olive", "ed", "vic", "ada"):
        assert inbox(team[other]) == {"items": [], "next_cursor": None, "unread_count": 0}


def test_repeating_an_invite_records_nothing_new(team, db):
    invite(team["olive"], team["prd"], team["nia"])
    invite(team["olive"], team["prd"], team["nia"])
    assert [e[0] for e in events(db, team["prd"])] == ["member_added"]
    assert inbox(team["nia"])["unread_count"] == 1


def test_role_changes_and_removals_are_recorded_without_notifying(team, db):
    olive, prd, ed = team["olive"], team["prd"], team["ed"]
    invite(olive, prd, ed, "viewer")
    assert olive.api("DELETE", f"/prds/{prd}/members/{ed.id}").status_code == 204
    assert events(db, prd) == [
        ("member_role_changed", {"user_id": ed.id, "from": "editor", "to": "viewer"}),
        ("member_removed", {"user_id": ed.id, "role": "viewer"}),
    ]
    assert db.execute("select count(*) from notification where prd_id = %s", (prd,)).fetchone()[0] == 0


def test_a_failed_invite_records_nothing(team, make_user, db):
    r = team["olive"].api("PUT", f"/prds/{team['prd']}/members/{make_user().id}", json={"role": "viewer"})
    assert r.status_code == 422
    assert events(db, team["prd"]) == []


def test_a_rolled_back_action_leaves_no_event_or_notification(team, db):
    with pytest.raises(RuntimeError):
        with db.transaction():
            record(db, team["prd"], "comment_added", team["olive"])
            raise RuntimeError("the action failed")
    assert events(db, team["prd"]) == []
    assert db.execute("select count(*) from notification where prd_id = %s", (team["prd"],)).fetchone()[0] == 0


def test_comments_notify_owners_and_editors_except_the_actor(team, db):
    record(db, team["prd"], "comment_added", team["ed"])
    assert inbox(team["olive"])["unread_count"] == 1
    for other in ("ed", "vic", "ada", "nia"):
        assert inbox(team[other])["unread_count"] == 0


def test_inactive_members_and_people_without_access_arent_notified(team, make_user, db):
    db.execute("update organization_member set active = false where user_id = %s", (team["ed"].id,))
    record(db, team["prd"], "comment_added", None)
    recipients = db.execute("select recipient_id::text from notification where prd_id = %s", (team["prd"],)).fetchall()
    assert recipients == [(team["olive"].id,)]
    outsider = make_user()
    record(db, team["prd"], "member_added", team["olive"], f'{{"user_id": "{outsider.id}"}}')
    assert inbox(outsider)["unread_count"] == 0


def test_review_decisions_and_done_work_notify_owners(team, db):
    record(db, team["prd"], "approved", team["ed"])
    record(db, team["prd"], "changes_requested", team["ed"])
    record(db, team["prd"], "work_status_changed", team["ed"], '{"status": "in_progress"}')
    record(db, team["prd"], "work_status_changed", team["ed"], '{"status": "done"}')
    assert [i["type"] for i in inbox(team["olive"])["items"]] == ["work_status_changed", "changes_requested", "approved"]
    assert inbox(team["vic"])["unread_count"] == 0


@pytest.mark.parametrize("event_type", ["submitted", "round_approved", "superseded"])
def test_reviewer_events_wait_for_e07(team, db, event_type):
    with pytest.raises(psycopg.errors.RaiseException):
        record(db, team["prd"], event_type, team["olive"])


def test_mark_read_is_idempotent_and_updates_the_count(team):
    invite(team["olive"], team["prd"], team["nia"])
    item = inbox(team["nia"])["items"][0]
    r = team["nia"].api("PATCH", f"/notifications/{item['id']}", json={"read": True})
    assert r.status_code == 200, r.text
    first = r.json()["read_at"]
    assert first and r.json()["type"] == "member_added"
    again = team["nia"].api("PATCH", f"/notifications/{item['id']}", json={"read": True})
    assert again.status_code == 200 and again.json()["read_at"] == first
    assert inbox(team["nia"])["unread_count"] == 0
    assert inbox(team["nia"], unread_only="true")["items"] == []
    assert len(inbox(team["nia"])["items"]) == 1


def test_only_the_recipient_can_mark_it_read(team):
    invite(team["olive"], team["prd"], team["nia"])
    item = inbox(team["nia"])["items"][0]
    r = team["olive"].api("PATCH", f"/notifications/{item['id']}", json={"read": True})
    assert r.status_code == 404 and r.json()["code"] == "not_found"
    assert team["nia"].api("PATCH", f"/notifications/{item['id']}", json={"read": False}).status_code == 422
    assert inbox(team["nia"])["unread_count"] == 1


def test_losing_access_hides_notifications_from_the_list_and_count(team):
    olive, prd, nia = team["olive"], team["prd"], team["nia"]
    invite(olive, prd, nia)
    item = inbox(nia)["items"][0]
    assert olive.api("DELETE", f"/prds/{prd}/members/{nia.id}").status_code == 204
    assert inbox(nia) == {"items": [], "next_cursor": None, "unread_count": 0}
    assert nia.api("PATCH", f"/notifications/{item['id']}", json={"read": True}).status_code == 404
    invite(olive, prd, nia)
    assert inbox(nia)["unread_count"] == 2


def test_the_inbox_pages_newest_first(team, db):
    for _ in range(3):
        record(db, team["prd"], "approved", team["ed"])
    ids = [i["id"] for i in inbox(team["olive"])["items"]]
    page1 = inbox(team["olive"], limit=2)
    assert [i["id"] for i in page1["items"]] == ids[:2] and page1["unread_count"] == 3
    page2 = inbox(team["olive"], limit=2, cursor=page1["next_cursor"])
    assert [i["id"] for i in page2["items"]] == ids[2:] and page2["next_cursor"] is None
    r = team["olive"].api("GET", "/notifications", params={"cursor": "not-a-cursor"})
    assert r.status_code == 400 and r.json()["code"] == "invalid_cursor"


def test_events_are_readable_by_people_who_can_view_the_prd(team):
    invite(team["olive"], team["prd"], team["nia"])
    path = f"prd_event?prd_id=eq.{team['prd']}&select=event_type"
    assert team["vic"].rest("GET", path).json() == [{"event_type": "member_added"}]
    assert team["ada"].rest("GET", path).json() == [{"event_type": "member_added"}]


def test_outsiders_cant_read_events(team, make_user):
    invite(team["olive"], team["prd"], team["nia"])
    assert make_user().rest("GET", f"prd_event?prd_id=eq.{team['prd']}").json() == []


def test_clients_cant_forge_events_or_notifications(team, db):
    olive, prd, nia = team["olive"], team["prd"], team["nia"]
    r = olive.rest("POST", "rpc/record_prd_event",
                   json={"p_prd_id": prd, "p_event_type": "approved", "p_actor": nia.id})
    assert r.status_code in (401, 403, 404)
    r = olive.rest("POST", "prd_event", json={"prd_id": prd, "event_type": "approved"})
    assert r.status_code in (401, 403)
    invite(olive, prd, nia)
    event = db.execute("select id::text from prd_event where prd_id = %s", (prd,)).fetchone()[0]
    r = olive.rest("POST", "notification", json={"event_id": event, "recipient_id": team["vic"].id, "prd_id": prd})
    assert r.status_code in (401, 403)
    r = nia.rest("PATCH", f"notification?recipient_id=eq.{nia.id}", json={"read_at": "2000-01-01T00:00:00Z"})
    assert r.status_code in (401, 403) or r.json() == []
    assert inbox(nia)["unread_count"] == 1
