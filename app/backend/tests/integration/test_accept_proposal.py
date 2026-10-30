"""Accepting an AI proposal through the save (A05) against the local stack:
intake -> preview (A03) -> accept with save_prd (#55 + A05) -> reopen.

Gemini is never called: proposals come from the preview with a fake model,
or are staged directly through A02. save_prd isn't wired into PUT yet, so
the save runs in this process with real clients, as the route will.
"""

import copy
import json
import threading
import time
from pathlib import Path

import psycopg
import pytest
from supabase import create_client

from ai import preview, records
from ai.acceptance import AcceptanceError
from ai.gemini_client import GeminiResult
from ai.generation import GenerationProposal
from conftest import ANON_KEY, DB_URL, SERVICE_KEY, SUPABASE_URL
from prd_save import SaveError, save_prd

FIXTURES = Path(__file__).resolve().parents[2].parent / "shared" / "fixtures" / "prd_document" / "valid"
if not FIXTURES.exists():  # backend container: app/shared is mounted at /shared
    FIXTURES = Path("/shared/fixtures/prd_document/valid")
DRAFT = json.loads((FIXTURES / "full_generated_draft.json").read_text(encoding="utf-8"))["document"]
SECTIONS = [s["attrs"]["type"] for s in DRAFT["content"]]
TITLE, DESCRIPTION = "Campus events PRD", "Help students find events."
REQUIRED = {"problem": "Students miss campus events", "target_users": "Students", "goals": "Higher turnout"}


@pytest.fixture(autouse=True)
def ai_on_here(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")


@pytest.fixture
def service():
    return create_client(SUPABASE_URL, SERVICE_KEY)


def as_user(user):
    client = create_client(SUPABASE_URL, ANON_KEY)
    client.postgrest.auth(user.token)
    return client


def fake_model(prompt, **kwargs):
    data = {"title": TITLE, "description": DESCRIPTION, "document": DRAFT}
    return GeminiResult(data=data, model="fake-model", prompt_tokens=120, output_tokens=880)


def previewed(user, service):
    """A PRD with answers and a staged proposal from the real preview."""
    prd = user.api("POST", "/prds", json={"title": "Campus events"}).json()
    for key, text in REQUIRED.items():
        user.api("PUT", f"/prds/{prd['id']}/intake/{key}", json={"answer_text": text})
    body = preview.generate_preview(as_user(user), service, actor_id=user.id, prd_id=prd["id"],
                                    revision=prd["revision"], call_model=fake_model)
    return prd, body


def staged(user, service, context_patch):
    """A PRD with a proposal staged straight through A02, with a context patch."""
    prd = user.api("POST", "/prds", json={"title": "Campus events"}).json()
    proposal = GenerationProposal(title=TITLE, description=DESCRIPTION, content_json=DRAFT, content_text="",
                                  doc_schema_version=2, model="fake-model", prompt_version="test",
                                  prompt_tokens=1, output_tokens=1)
    result = records.record_generation(service, actor_id=user.id, prd_id=prd["id"], base_revision=prd["revision"],
                                       proposal=proposal, context_patch=context_patch)
    return prd, result.generation_record_id


def accept(service, user, prd, record_id, *, content=None, title=TITLE, revision=None):
    return save_prd(service, user.id, prd["id"], revision or prd["revision"], title=title, description=DESCRIPTION,
                    content_json=copy.deepcopy(DRAFT) if content is None else content,
                    origin="ai_generated", generation_record_id=record_id)


def marked_sections(document, record_id):
    def marked(node):
        if node.get("type") == "text":
            return any(m["type"] == "ai_generated" and m["attrs"]["generation_record_id"] == record_id
                       for m in node.get("marks", []))
        return any(marked(c) for c in node.get("content", []))
    return [s["attrs"]["type"] for s in document["content"] if marked(s)]


def proposal_status(db, record_id):
    return db.execute("select status from ai_proposal where generation_record_id = %s", (record_id,)).fetchone()[0]


def versions(db, prd_id):
    return db.execute("select version_no, saved_revision, origin, created_by::text, generation_record_id::text, "
                      "changed_sections, change_summary from prd_version where prd_id = %s order by version_no",
                      (prd_id,)).fetchall()


def context(db, prd_id):
    return db.execute("select context_json, version from prd_context where prd_id = %s", (prd_id,)).fetchone()


# --- the whole path ------------------------------------------------------------------


def test_intake_preview_accept_and_reopen(make_user, db, service):
    alice = make_user()
    prd, body = previewed(alice, service)
    record_id = body["generation_record_id"]

    saved = accept(service, alice, prd, record_id, content=body["proposal"]["content_json"])

    assert saved["revision"] == prd["revision"] + 1 and saved["doc_schema_version"] == 2
    assert saved["title"] == TITLE and saved["description"] == DESCRIPTION and saved["status"] == "draft"
    assert marked_sections(saved["content_json"], record_id) == SECTIONS
    assert proposal_status(db, record_id) == "accepted"
    assert versions(db, prd["id"]) == [(1, prd["revision"] + 1, "ai_generated", alice.id, record_id, SECTIONS,
                                        "Accepted AI proposal: title, description, 9 sections")]
    # Reopen through the running API: the saved v2 document comes back as saved.
    reopened = alice.api("GET", f"/prds/{prd['id']}").json()
    assert reopened["content_json"] == saved["content_json"] and reopened["revision"] == saved["revision"]


def test_edited_acceptance_marks_only_unedited_sections(make_user, db, service):
    alice = make_user()
    prd, body = previewed(alice, service)
    edited = copy.deepcopy(body["proposal"]["content_json"])
    edited["content"][1]["content"] = [{"type": "paragraph", "content": [{"type": "text", "text": "Our goals"}]}]

    saved = accept(service, alice, prd, body["generation_record_id"], content=edited)

    marked = marked_sections(saved["content_json"], body["generation_record_id"])
    assert SECTIONS[1] not in marked and len(marked) == len(SECTIONS) - 1
    assert versions(db, prd["id"])[0][2] == "ai_generated"  # the save still records the AI involvement


# --- context ---------------------------------------------------------------------------


def test_unedited_acceptance_merges_the_staged_context(make_user, db, service):
    alice = make_user()
    prd, record_id = staged(alice, service, {"decisions": ["Weekly digest first"]})
    accept(service, alice, prd, record_id)
    assert context(db, prd["id"]) == ({"decisions": ["Weekly digest first"]}, 2)


def test_edited_acceptance_drops_the_staged_context(make_user, db, service):
    alice = make_user()
    prd, record_id = staged(alice, service, {"decisions": ["Weekly digest first"]})
    accept(service, alice, prd, record_id, title="Our own title")
    assert context(db, prd["id"]) == ({}, 1)
    assert proposal_status(db, record_id) == "accepted"


# --- once only, bound, never forced --------------------------------------------------


def test_retry_after_a_lost_response_returns_the_saved_state(make_user, db, service):
    alice = make_user()
    prd, body = previewed(alice, service)
    first = accept(service, alice, prd, body["generation_record_id"])
    again = accept(service, alice, prd, body["generation_record_id"])  # same request, same base revision
    assert again["revision"] == first["revision"] and len(versions(db, prd["id"])) == 1


def test_proposal_cannot_be_used_after_a_later_save(make_user, db, service):
    alice = make_user()
    prd, body = previewed(alice, service)
    first = accept(service, alice, prd, body["generation_record_id"])
    save_prd(service, alice.id, prd["id"], first["revision"], title="Edited afterwards")
    with pytest.raises(SaveError) as info:
        accept(service, alice, prd, body["generation_record_id"])
    assert info.value.code == "stale_revision" and len(versions(db, prd["id"])) == 2


def test_a_save_after_the_preview_makes_the_proposal_stale(make_user, db, service):
    alice = make_user()
    prd, body = previewed(alice, service)
    moved = save_prd(service, alice.id, prd["id"], prd["revision"], title="Renamed meanwhile")
    with pytest.raises(SaveError) as info:  # the proposal's own base revision
        accept(service, alice, prd, body["generation_record_id"])
    assert info.value.code == "stale_revision"
    with pytest.raises(AcceptanceError) as info:  # swapping in the new revision doesn't force it through
        accept(service, alice, prd, body["generation_record_id"], revision=moved["revision"])
    assert info.value.code == "stale_revision"
    assert proposal_status(db, body["generation_record_id"]) == "pending"


def test_the_database_refuses_someone_elses_proposal(make_user, db, service):
    # Straight to save_prd, skipping the Python checks: an admin can edit
    # Alice's PRD under today's rules but can't use her proposal.
    alice, admin = make_user(), make_user("admin")
    prd, body = previewed(alice, service)
    with pytest.raises(Exception) as info:
        service.rpc("save_prd", {
            "p_actor": admin.id, "p_prd_id": prd["id"], "p_base_revision": prd["revision"],
            "p_set_title": True, "p_title": "Taken", "p_set_description": False, "p_description": None,
            "p_set_content": False, "p_content_json": None, "p_content_text": None, "p_ai_generation_ids": [],
            "p_origin": "ai_generated", "p_generation_record_id": body["generation_record_id"],
            "p_apply_context_patch": False}).execute()
    assert getattr(info.value, "code", None) == "NTPRP"
    assert proposal_status(db, body["generation_record_id"]) == "pending" and versions(db, prd["id"]) == []


def test_expired_proposal_changes_nothing(make_user, db, service):
    alice = make_user()
    prd, body = previewed(alice, service)
    db.execute("update ai_proposal set expires_at = now() - interval '1 second' where generation_record_id = %s",
               (body["generation_record_id"],))
    with pytest.raises(SaveError) as info:
        accept(service, alice, prd, body["generation_record_id"])
    assert info.value.code == "proposal_unavailable"
    assert db.execute("select revision, content_json from prd where id = %s", (prd["id"],)).fetchone() \
        == (prd["revision"], None)
    assert versions(db, prd["id"]) == []


def test_racing_save_gives_409_with_no_partial_acceptance(make_user, db, service):
    alice = make_user()
    prd, record_id = staged(alice, service, {"decisions": ["Weekly digest first"]})
    outcome = {}
    with psycopg.connect(DB_URL) as other:  # a concurrent save holding the PRD lock
        other.execute("select 1 from prd where id = %s for update", (prd["id"],))

        def run():
            try:
                accept(service, alice, prd, record_id)
            except SaveError as exc:
                outcome["code"] = exc.code
        thread = threading.Thread(target=run)
        thread.start()
        time.sleep(1.0)  # the acceptance is now waiting for the lock
        other.execute("update prd set revision = revision + 1 where id = %s", (prd["id"],))
        other.commit()
        thread.join(10)
    assert outcome == {"code": "stale_revision"}
    assert proposal_status(db, record_id) == "pending"
    assert versions(db, prd["id"]) == [] and context(db, prd["id"]) == ({}, 1)
