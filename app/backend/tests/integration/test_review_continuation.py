"""E09's continuation step (built here for Marco's save): editing a PRD in review
supersedes the round and continues it on the new version with the same reviewers."""

import pytest

from conftest import EMPTY_DOC, add_to_prd, org_prd, save_version


@pytest.fixture
def team(make_user, make_org, db):
    """Olive owns the PRD; Ed edits it; Rae and Ray review it."""
    olive, ed, rae, ray = (make_user() for _ in range(4))
    org = make_org(olive, ed, rae, ray)
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    save_version(db, prd, olive)
    revision, version = db.execute("select revision, current_version_id::text from prd where id = %s", (prd,)).fetchone()
    r = olive.api("POST", f"/prds/{prd}/reviews",
                  json={"revision": revision, "version_id": version, "reviewer_ids": [rae.id, ray.id]})
    assert r.status_code == 201, r.text
    return dict(olive=olive, ed=ed, rae=rae, ray=ray, org=org, prd=prd, round=r.json()["round"]["id"])


def decide(db, team, who, state):
    db.execute("update review_slot set state = %s, decided_at = now() where round_id = %s and reviewer_id = %s",
               (state, team["round"], team[who].id))


def edit_and_continue(db, team, content=None):
    """What Marco's save will do: write a new version, then continue the round."""
    if content is None:
        save_version(db, team["prd"], team["ed"])
    else:
        save_version(db, team["prd"], team["ed"], content)
    return db.execute("select old_round_id::text, new_round_id::text, reset_reviewer_ids::text[] "
                      "from continue_review_round(%s, %s)", (team["prd"], team["ed"].id)).fetchone()


def rounds(db, prd):
    return db.execute("select round_no, state, (select count(*) from review_slot s where s.round_id = r.id) "
                      "from review_round r where prd_id = %s order by round_no", (prd,)).fetchall()


def test_an_edit_continues_the_review_on_the_new_version(team, db):
    decide(db, team, "rae", "approved")
    old, new, reset = edit_and_continue(db, team)
    assert old == team["round"] and new and reset == [team["rae"].id]
    assert rounds(db, team["prd"]) == [(1, "superseded", 2), (2, "in_review", 2)]
    version, status = db.execute("select current_version_id::text, status from prd where id = %s",
                                 (team["prd"],)).fetchone()
    assert status == "in_review"
    assert db.execute("select version_id::text from review_round where id = %s", (new,)).fetchone()[0] == version
    states = db.execute("select state from review_slot where round_id = %s", (new,)).fetchall()
    assert states == [("pending",), ("pending",)]


def test_change_requests_are_reset_but_kept_as_history(team, db):
    decide(db, team, "ray", "changes_requested")
    _, _, reset = edit_and_continue(db, team)
    assert reset == [team["ray"].id]
    listed = team["olive"].api("GET", f"/prds/{team['prd']}/reviews").json()["items"]
    assert [(r["round_no"], r["state"]) for r in listed] == [(2, "in_review"), (1, "superseded")]
    ray_before = next(x for x in listed[1]["reviewers"] if x["user_id"] == team["ray"].id)
    assert ray_before["state"] == "changes_requested"


def test_the_superseded_event_reaches_only_reviewers_who_had_decided(team, db):
    decide(db, team, "rae", "approved")
    decide(db, team, "ray", "pending")
    old, _, reset = edit_and_continue(db, team)
    db.execute("select record_prd_event(%s, 'superseded', %s, jsonb_build_object('reviewer_ids', %s::uuid[]), "
               "null, %s)", (team["prd"], team["ed"].id, reset, old))
    def types(who):
        return [i["type"] for i in team[who].api("GET", "/notifications").json()["items"]]
    assert types("rae") == ["superseded", "submitted"]
    assert types("ray") == ["submitted"]


def test_departed_reviewers_are_dropped(team, db):
    db.execute("update organization_member set active = false where user_id = %s", (team["rae"].id,))
    _, new, _ = edit_and_continue(db, team)
    reviewers = db.execute("select reviewer_id::text from review_slot where round_id = %s", (new,)).fetchall()
    assert reviewers == [(team["ray"].id,)]


def test_with_no_reviewers_left_the_prd_goes_back_to_draft(team, db):
    db.execute("update organization_member set active = false where user_id in (%s, %s)",
               (team["rae"].id, team["ray"].id))
    _, new, _ = edit_and_continue(db, team)
    assert new is None
    assert db.execute("select status from prd where id = %s", (team["prd"],)).fetchone()[0] == "draft"
    assert rounds(db, team["prd"]) == [(1, "superseded", 2)]


def test_an_emptied_prd_goes_back_to_draft(team, db):
    decide(db, team, "rae", "approved")
    _, new, reset = edit_and_continue(db, team, EMPTY_DOC)
    assert new is None and reset == [team["rae"].id]
    assert db.execute("select status from prd where id = %s", (team["prd"],)).fetchone()[0] == "draft"


def test_nothing_happens_without_a_new_version_or_an_open_round(team, db, make_user):
    old, new, reset = db.execute("select old_round_id::text, new_round_id, reset_reviewer_ids::text[] "
                                 "from continue_review_round(%s, %s)", (team["prd"], team["ed"].id)).fetchone()
    assert (old, new, reset) == (team["round"], None, [])
    draft = org_prd(db, team["org"], team["olive"], "Draft")
    save_version(db, draft, team["olive"])
    row = db.execute("select * from continue_review_round(%s, %s)", (draft, team["olive"].id)).fetchone()
    assert row == (None, None, [])
    assert rounds(db, team["prd"]) == [(1, "in_review", 2)]


def test_an_approved_round_is_left_to_the_owners_modal(team, db):
    db.execute("update review_round set state = 'approved' where id = %s", (team["round"],))
    save_version(db, team["prd"], team["olive"])
    with pytest.raises(Exception, match="approved_round_needs_owner"):
        db.execute("select * from continue_review_round(%s, %s)", (team["prd"], team["olive"].id))


def test_the_owner_review_exception_carries_over(make_user, make_org, db):
    solo = make_user()
    org = make_org(solo)
    prd = org_prd(db, org, solo, "Solo PRD")
    version = save_version(db, prd, solo)
    revision = db.execute("select revision from prd where id = %s", (prd,)).fetchone()[0]
    assert solo.api("POST", f"/prds/{prd}/reviews", json={"revision": revision, "version_id": version,
                                                         "reviewer_ids": [solo.id]}).status_code == 201
    newcomer = make_user()
    db.execute("delete from organization where created_by = %s", (newcomer.id,))
    db.execute("insert into organization_member (organization_id, user_id) values (%s, %s)", (org, newcomer.id))
    save_version(db, prd, solo)
    _, new, _ = db.execute("select * from continue_review_round(%s, %s)", (prd, solo.id)).fetchone()
    assert db.execute("select owner_review_allowed from review_round where id = %s", (new,)).fetchone()[0] is True
    assert db.execute("select reviewer_id::text from review_slot where round_id = %s", (new,)).fetchall() == [(solo.id,)]


def test_clients_cant_call_it(team):
    r = team["olive"].rest("POST", "rpc/continue_review_round", json={"p_prd_id": team["prd"], "p_actor": team["olive"].id})
    assert r.status_code in (401, 403, 404)
