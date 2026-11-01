"""One event per save (20261031180000_save_events.sql) against the local stack:
a person's save records version_saved, an accepted AI proposal records
ai_applied instead, and saves that change nothing or fail record nothing.
Neither type notifies anyone.

Gemini is never called: proposals are staged through A02 as in
test_accept_proposal.py.
"""

import copy

import pytest
from supabase import create_client

from ai import records
from ai.generation import GenerationProposal
from conftest import SERVICE_KEY, SUPABASE_URL, add_to_prd
from prd_save import SaveError, save_prd
from test_accept_proposal import DESCRIPTION, DRAFT, TITLE, verified

EDITED = {"type": "doc", "content": [{"type": "section", "attrs": {"type": "goals"},
                                      "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Grow"}]}]}]}


@pytest.fixture(autouse=True)
def ai_on_here(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")


@pytest.fixture
def service():
    return create_client(SUPABASE_URL, SERVICE_KEY)


def events(db, prd_id):
    return db.execute("select event_type, actor_id::text, payload, version_id::text from prd_event "
                      "where prd_id = %s order by created_at, id", (prd_id,)).fetchall()


def notifications(db, prd_id):
    return db.execute("select count(*) from notification where prd_id = %s", (prd_id,)).fetchone()[0]


def current(db, prd_id):
    return db.execute("select revision, current_version_id::text from prd where id = %s", (prd_id,)).fetchone()


def test_a_save_records_one_version_saved_event(db, service, make_user, make_org):
    owner, editor = make_user(), make_user()
    make_org(owner, editor)
    prd = owner.api("POST", "/prds", json={"title": "Events"}).json()
    add_to_prd(db, prd["id"], editor, "editor")

    save_prd(service, verified(service, editor), prd["id"], prd["revision"], title="Events v2", content_json=EDITED)
    _, version_id = current(db, prd["id"])
    assert events(db, prd["id"]) == [
        ("version_saved", editor.id, {"version_no": 1, "changed": ["title", "goals"]}, version_id)]
    # Ordinary edits notify nobody, not even the owner.
    assert notifications(db, prd["id"]) == 0


def test_saves_that_change_nothing_or_fail_record_nothing(db, service, make_user, make_org):
    owner, viewer = make_user(), make_user()
    make_org(owner, viewer)
    prd = owner.api("POST", "/prds", json={"title": "Events"}).json()
    add_to_prd(db, prd["id"], viewer, "viewer")
    user = verified(service, owner)

    save_prd(service, user, prd["id"], prd["revision"], description="First")
    revision, _ = current(db, prd["id"])
    save_prd(service, user, prd["id"], revision, description="First")  # no change: no revision, no event
    with pytest.raises(SaveError) as stale:
        save_prd(service, user, prd["id"], prd["revision"], description="Late")
    assert stale.value.status_code == 409
    with pytest.raises(SaveError) as forbidden:
        save_prd(service, verified(service, viewer), prd["id"], revision, description="Viewer")
    assert forbidden.value.status_code == 403

    assert [e[0] for e in events(db, prd["id"])] == ["version_saved"]
    assert events(db, prd["id"])[0][2] == {"version_no": 1, "changed": ["description"]}


def test_an_accepted_proposal_records_ai_applied_instead(db, service, make_user, make_org):
    owner = make_user()
    make_org(owner)
    prd = owner.api("POST", "/prds", json={"title": "Campus events"}).json()
    proposal = GenerationProposal(title=TITLE, description=DESCRIPTION, content_json=DRAFT, content_text="",
                                  doc_schema_version=2, model="fake-model", prompt_version="test",
                                  prompt_tokens=1, output_tokens=1)
    record_id = records.record_generation(service, actor_id=owner.id, prd_id=prd["id"],
                                          base_revision=prd["revision"], proposal=proposal).generation_record_id
    user = verified(service, owner)

    def accept():
        return save_prd(service, user, prd["id"], prd["revision"], title=TITLE, description=DESCRIPTION,
                        content_json=copy.deepcopy(DRAFT), origin="ai_generated", generation_record_id=record_id)

    accept()
    accept()  # a retry after a lost response returns the saved state, with no second event
    _, version_id = current(db, prd["id"])
    [(event_type, actor, payload, event_version)] = events(db, prd["id"])
    assert (event_type, actor, event_version) == ("ai_applied", owner.id, version_id)
    assert payload["generation_record_id"] == str(record_id) and payload["version_no"] == 1
    assert payload["changed"][:2] == ["title", "description"] and len(payload["changed"]) == 2 + len(DRAFT["content"])
    # Provenance stays on the version too.
    assert db.execute("select origin, generation_record_id::text from prd_version where id = %s",
                      (version_id,)).fetchone() == ("ai_generated", str(record_id))
    assert notifications(db, prd["id"]) == 0
