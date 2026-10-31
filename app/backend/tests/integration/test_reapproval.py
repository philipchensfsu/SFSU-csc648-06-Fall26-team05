"""E09 reapproval in the save (20261031190000_e09_reapproval.sql) against the
local stack, on Vineela's review rounds (#93): continue_review_round for an
edit in review, open_review_round for an owner's confirmed edit to an
approved PRD, and exactly one event per save either way.

Decisions are set directly on review_slot (as #93's own tests do), so this
doesn't depend on E08's decision route.
"""

import copy

import pytest
from supabase import create_client

from ai import records
from ai.generation import GenerationProposal
from conftest import SERVICE_KEY, SUPABASE_URL, add_to_prd
from prd_save import SaveError, save_prd
from test_accept_proposal import DESCRIPTION, DRAFT, TITLE, verified


def doc(text):
    return {"type": "doc", "content": [{"type": "section", "attrs": {"type": "goals"},
                                        "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}]}


@pytest.fixture(autouse=True)
def ai_on_here(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")


@pytest.fixture
def service():
    return create_client(SUPABASE_URL, SERVICE_KEY)


@pytest.fixture
def team(db, service, make_user, make_org):
    """Owner Olive, editor Ed, reviewers Ann, Bob and Cy, plus Dee (a member
    who isn't a reviewer yet). The PRD is saved once and in review with Ann,
    Bob and Cy."""
    olive, ed, ann, bob, cy, dee = (make_user() for _ in range(6))
    make_org(olive, ed, ann, bob, cy, dee)
    prd = olive.api("POST", "/prds", json={"title": "Reviewed PRD"}).json()
    add_to_prd(db, prd["id"], ed, "editor")
    save_prd(service, verified(service, olive), prd["id"], prd["revision"], content_json=doc("First"))
    revision, version = state(db, prd["id"])[:2]
    r = olive.api("POST", f"/prds/{prd['id']}/reviews",
                  json={"revision": revision, "version_id": version, "reviewer_ids": [ann.id, bob.id, cy.id]})
    assert r.status_code == 201, r.json()
    return {"prd": prd["id"], "olive": olive, "ed": ed, "ann": ann, "bob": bob, "cy": cy, "dee": dee}


def state(db, prd_id):
    return db.execute("select revision, current_version_id::text, status from prd where id = %s", (prd_id,)).fetchone()


def rounds(db, prd_id):
    return db.execute("select id::text, round_no, state, version_id::text from review_round where prd_id = %s "
                      "order by round_no", (prd_id,)).fetchall()


def slots(db, round_id):
    return dict(db.execute("select reviewer_id::text, state from review_slot where round_id = %s",
                           (round_id,)).fetchall())


def decide(db, round_id, user, decision):
    db.execute("update review_slot set state = %s, decided_at = now() where round_id = %s and reviewer_id = %s",
               (decision, round_id, user.id))


def events_after_submit(db, prd_id):
    """Events recorded after the review was submitted: (type, actor, payload, version, round)."""
    return db.execute("""
        select event_type, actor_id::text, payload, version_id::text, round_id::text from prd_event
        where prd_id = %s and created_at > (select min(created_at) from prd_event
                                            where prd_id = %s and event_type = 'submitted')
        order by created_at, id""", (prd_id, prd_id)).fetchall()


def inbox(user):
    return [n["type"] for n in user.api("GET", "/notifications").json()["items"]]


def save(service, db, user, prd_id, **fields):
    return save_prd(service, verified(service, user), prd_id, state(db, prd_id)[0], **fields)


def test_an_edit_in_review_continues_the_round_with_one_superseded_event(team, db, service):
    [(old_round, _, _, old_version)] = rounds(db, team["prd"])
    decide(db, old_round, team["ann"], "approved")
    decide(db, old_round, team["cy"], "changes_requested")

    save(service, db, team["ed"], team["prd"], content_json=doc("Second"))

    _, new_version, status = state(db, team["prd"])
    assert status == "in_review"
    (_, _, old_state, _), (new_round, round_no, new_state, round_version) = rounds(db, team["prd"])
    assert (old_state, round_no, new_state, round_version) == ("superseded", 2, "in_review", new_version)
    assert set(slots(db, new_round).values()) == {"pending"}  # every decision reset
    assert slots(db, old_round)[team["ann"].id] == "approved"  # history kept on the old round

    [(event_type, actor, payload, version, round_id)] = events_after_submit(db, team["prd"])
    assert (event_type, actor, version, round_id) == ("superseded", team["ed"].id, new_version, old_round)
    assert sorted(payload["reviewer_ids"]) == sorted([team["ann"].id, team["cy"].id])
    assert payload["continued"] is True and payload["changed"] == ["goals"]
    # Everyone who had decided hears about it; the undecided reviewer doesn't.
    assert inbox(team["ann"]) == ["superseded", "submitted"]
    assert inbox(team["cy"]) == ["superseded", "submitted"]
    assert inbox(team["bob"]) == ["submitted"]


def test_an_edit_that_empties_the_prd_sends_it_back_to_draft(team, db, service):
    [(old_round, *_)] = rounds(db, team["prd"])
    decide(db, old_round, team["ann"], "approved")
    save(service, db, team["olive"], team["prd"], content_json={"type": "doc", "content": []})
    assert state(db, team["prd"])[2] == "draft"
    assert [r[2] for r in rounds(db, team["prd"])] == ["superseded"]
    [(event_type, _, payload, _, _)] = events_after_submit(db, team["prd"])
    assert event_type == "superseded" and payload["continued"] is False
    assert payload["reviewer_ids"] == [team["ann"].id]


def test_an_accepted_ai_proposal_in_review_records_superseded_with_its_provenance(team, db, service):
    proposal = GenerationProposal(title=TITLE, description=DESCRIPTION, content_json=DRAFT, content_text="",
                                  doc_schema_version=2, model="fake-model", prompt_version="test",
                                  prompt_tokens=1, output_tokens=1)
    revision = state(db, team["prd"])[0]
    record_id = records.record_generation(service, actor_id=team["olive"].id, prd_id=team["prd"],
                                          base_revision=revision, proposal=proposal).generation_record_id
    save_prd(service, verified(service, team["olive"]), team["prd"], revision, title=TITLE, description=DESCRIPTION,
             content_json=copy.deepcopy(DRAFT), origin="ai_generated", generation_record_id=record_id)
    # Review state takes precedence: one superseded event, no ai_applied.
    [(event_type, _, payload, version, _)] = events_after_submit(db, team["prd"])
    assert event_type == "superseded" and payload["generation_record_id"] == str(record_id)
    assert db.execute("select origin, generation_record_id::text from prd_version where id = %s",
                      (version,)).fetchone() == ("ai_generated", str(record_id))


def approve(db, team):
    """The round approved by everyone and the PRD final, as E08 leaves it."""
    [(round_id, *_)] = rounds(db, team["prd"])
    for who in ("ann", "bob", "cy"):
        decide(db, round_id, team[who], "approved")
    db.execute("update review_round set state = 'approved', completed_at = now() where id = %s", (round_id,))
    db.execute("update prd set status = 'final' where id = %s", (team["prd"],))
    return round_id


def test_approved_prds_take_only_an_owners_confirmed_edit(team, db, service):
    approve(db, team)
    before = state(db, team["prd"])
    with pytest.raises(SaveError) as editor:
        save(service, db, team["ed"], team["prd"], title="Editor edit", confirmed_reviewer_ids=[team["ann"].id])
    assert (editor.value.status_code, editor.value.code) == (403, "owner_required")
    with pytest.raises(SaveError) as no_list:
        save(service, db, team["olive"], team["prd"], title="No list")
    assert (no_list.value.status_code, no_list.value.code) == (409, "reapproval_required")
    with pytest.raises(SaveError) as empty:
        save(service, db, team["olive"], team["prd"], title="Empty list", confirmed_reviewer_ids=[])
    assert (empty.value.status_code, empty.value.code) == (422, "no_reviewers")
    assert state(db, team["prd"]) == before and events_after_submit(db, team["prd"]) == []


def test_an_owners_confirmed_edit_starts_a_new_round_with_one_submitted_event(team, db, service):
    approved_round = approve(db, team)
    # The owner keeps Ann, drops Bob and Cy, and adds Dee in the modal.
    save(service, db, team["olive"], team["prd"], content_json=doc("Edited after approval"),
         confirmed_reviewer_ids=[team["ann"].id, team["dee"].id])

    _, new_version, status = state(db, team["prd"])
    assert status == "in_review"
    (old_id, _, old_state, _), (new_round, round_no, new_state, round_version) = rounds(db, team["prd"])
    assert (old_id, old_state) == (approved_round, "superseded")
    assert (round_no, new_state, round_version) == (2, "in_review", new_version)
    assert slots(db, new_round) == {team["ann"].id: "pending", team["dee"].id: "pending"}

    [(event_type, actor, payload, version, round_id)] = events_after_submit(db, team["prd"])
    assert (event_type, actor, version, round_id) == ("submitted", team["olive"].id, new_version, new_round)
    assert payload["resubmitted"] is True
    assert inbox(team["ann"]) == ["submitted", "submitted"]
    assert inbox(team["dee"]) == ["submitted"]
    assert inbox(team["bob"]) == ["submitted"]  # removed in the modal: nothing new


def test_a_reviewer_list_is_refused_for_a_prd_that_isnt_approved(team, db, service):
    before = state(db, team["prd"])
    with pytest.raises(SaveError) as info:
        save(service, db, team["olive"], team["prd"], title="Not approved", confirmed_reviewer_ids=[team["ann"].id])
    assert (info.value.status_code, info.value.code) == (422, "confirmed_reviewers_not_allowed")
    assert state(db, team["prd"]) == before


def test_a_save_that_changes_nothing_needs_no_list_and_records_nothing(team, db, service):
    approve(db, team)
    before = state(db, team["prd"])
    save(service, db, team["olive"], team["prd"], content_json=doc("First"))  # same content
    assert state(db, team["prd"]) == before and events_after_submit(db, team["prd"]) == []
