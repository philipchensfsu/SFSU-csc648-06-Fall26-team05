"""AI section edits against the local stack: request -> staged proposal ->
explicit acceptance through the save core, with real RLS, A02 staging and
A05's once-only take. Gemini isn't called and Om's modules are doubles here;
the running API, without his modules, answers 503."""

import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from supabase import create_client

from ai import chat, section_edit
from ai.acceptance import AcceptanceError
from ai.gemini_client import GeminiResult
from conftest import ANON_KEY, SERVICE_KEY, SUPABASE_URL, add_to_prd, org_prd
from errors import ApiError
from prd_save import SaveError, save_prd

FIXTURES = Path(__file__).resolve().parents[2].parent / "shared" / "fixtures" / "prd_document" / "valid"
if not FIXTURES.exists():  # backend container: app/shared is mounted at /shared
    FIXTURES = Path("/shared/fixtures/prd_document/valid")
DOC = json.loads((FIXTURES / "full_generated_draft.json").read_text(encoding="utf-8"))["document"]
NEW_GOALS = {"type": "section", "attrs": {"type": "goals"}, "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "Cut drafting time by half within a semester."}]}]}


@pytest.fixture(autouse=True)
def ai_on_here(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("AI_COOLDOWN_SECONDS", "0")


@pytest.fixture
def service():
    return create_client(SUPABASE_URL, SERVICE_KEY)


def as_user(user):
    client = create_client(SUPABASE_URL, ANON_KEY)
    client.postgrest.auth(user.token)
    return client


def verified(service, user):
    return service.auth.get_user(user.token).user


def doubles():
    guardrails = SimpleNamespace(check_scope=lambda *a, call_model, timeout_seconds, **k: "allow")
    prompts = SimpleNamespace(FIXED_REFUSAL="Only this PRD.", FIXED_CLARIFICATION="How does it relate?",
                              CHAT_PROMPT_VERSION="v", CHAT_SYSTEM_INSTRUCTION="", CHAT_RESPONSE_SCHEMA={},
                              build_chat_prompt=lambda *a: "")
    return chat.ChatModules(guardrails, prompts)


def fake_model(prompt, **kwargs):
    return GeminiResult(data={"section": NEW_GOALS, "message": "Made the goal measurable."}, model="fake",
                        prompt_tokens=5, output_tokens=7)


@pytest.fixture
def cast(make_user, make_org, db, service):
    owner, editor, viewer = make_user(), make_user(), make_user()
    prd = org_prd(db, make_org(owner, editor, viewer), owner, "Edit me")
    add_to_prd(db, prd, editor, "editor")
    add_to_prd(db, prd, viewer, "viewer")
    save_prd(service, verified(service, owner), prd, 1, content_json=DOC)  # revision 2, v2 content
    return dict(prd=prd, owner=owner, editor=editor, viewer=viewer)


def request_edit(user, prd, service, revision=2):
    return section_edit.propose_section_edit(
        as_user(user), service, actor_id=user.id, prd_id=prd, revision=revision, section_type="goals",
        instruction="Make the goals measurable.", session_messages=[], modules=doubles(), call_model=fake_model)


def state(db, prd):
    return (db.execute("select content_json, revision, status from prd where id = %s", (prd,)).fetchone(),
            db.execute("select count(*) from prd_version where prd_id = %s", (prd,)).fetchone()[0])


def proposal_status(db, record_id):
    return db.execute("select kind, status from ai_proposal where generation_record_id = %s", (record_id,)).fetchone()


def test_editor_previews_then_accepts_one_section(cast, db, service):
    before = state(db, cast["prd"])
    body = request_edit(cast["editor"], cast["prd"], service)
    assert body["kind"] == "proposal" and body["base_revision"] == 2
    assert state(db, cast["prd"]) == before  # nothing saved by the request
    assert proposal_status(db, body["generation_record_id"]) == ("ai_edit", "pending")

    saved = save_prd(service, verified(service, cast["editor"]), cast["prd"], 2,
                     content_json=body["proposal"]["content_json"], origin="ai_generated",
                     generation_record_id=body["generation_record_id"])
    assert saved["revision"] == 3
    for old, new in zip(DOC["content"], saved["content_json"]["content"]):
        if old["attrs"]["type"] == "goals":
            assert "ai_generated" in json.dumps(new) and body["generation_record_id"] in json.dumps(new)
        else:
            assert new == old  # untouched sections survive exactly
    assert proposal_status(db, body["generation_record_id"]) == ("ai_edit", "accepted")
    version = db.execute("select origin, created_by::text, generation_record_id::text, changed_sections "
                         "from prd_version where prd_id = %s order by version_no desc limit 1", (cast["prd"],)).fetchone()
    assert version == ("ai_generated", cast["editor"].id, body["generation_record_id"], ["goals"])


def test_viewers_can_chat_but_not_request_edits(cast, db, service):
    with pytest.raises(ApiError) as info:
        request_edit(cast["viewer"], cast["prd"], service)
    assert (info.value.status_code, info.value.code) == (403, "forbidden")
    assert db.execute("select count(*) from generation_record where prd_id = %s", (cast["prd"],)).fetchone() == (0,)
    assert db.execute("select count(*) from ai_usage_gate where user_id = %s", (cast["viewer"].id,)).fetchone() == (0,)


def test_a_save_after_the_proposal_makes_it_stale(cast, db, service):
    body = request_edit(cast["editor"], cast["prd"], service)
    save_prd(service, verified(service, cast["owner"]), cast["prd"], 2, title="Renamed meanwhile")
    with pytest.raises(SaveError) as info:
        save_prd(service, verified(service, cast["editor"]), cast["prd"], 2,
                 content_json=body["proposal"]["content_json"], origin="ai_generated",
                 generation_record_id=body["generation_record_id"])
    assert info.value.code == "stale_revision"
    assert proposal_status(db, body["generation_record_id"]) == ("ai_edit", "pending")


def test_accepting_cannot_slip_in_other_changes_or_be_reused(cast, db, service):
    body = request_edit(cast["editor"], cast["prd"], service)
    sneaky = copy.deepcopy(body["proposal"]["content_json"])
    sneaky["content"][0]["content"][0]["content"][0]["text"] = "Changed problem statement."
    editor = verified(service, cast["editor"])
    with pytest.raises(AcceptanceError) as info:
        save_prd(service, editor, cast["prd"], 2, content_json=sneaky, origin="ai_generated",
                 generation_record_id=body["generation_record_id"])
    assert info.value.code == "proposal_scope"
    # The owner can't use the editor's proposal either.
    with pytest.raises(AcceptanceError) as info:
        save_prd(service, verified(service, cast["owner"]), cast["prd"], 2,
                 content_json=body["proposal"]["content_json"], origin="ai_generated",
                 generation_record_id=body["generation_record_id"])
    assert info.value.code == "proposal_unavailable"
    assert state(db, cast["prd"])[0][1] == 2


def test_legacy_documents_get_a_clear_409(make_user, db, service):
    alice = make_user()
    prd = alice.api("POST", "/prds", json={"title": "Old format"}).json()
    db.execute("update prd set content_json = %s, doc_schema_version = 1 where id = %s",
               (json.dumps({"sections": []}), prd["id"]))
    with pytest.raises(ApiError) as info:
        request_edit(alice, prd["id"], service, revision=prd["revision"])
    assert (info.value.status_code, info.value.code) == (409, "document_not_v2")


def test_running_api_stays_disabled_without_oms_modules(cast):
    if chat.load_modules() is not None:
        pytest.skip("Om's modules are present")
    r = cast["editor"].api("POST", f"/prds/{cast['prd']}/ai-edit",
                           json={"revision": 2, "section_type": "goals", "instruction": "x"})
    assert (r.status_code, r.json()["code"]) == (503, "ai_chat_unavailable")
