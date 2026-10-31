"""Generation preview (A03) against the local stack: real sign-ins, RLS,
can_edit_prd, the A07 gate and the A02 recording functions.

Gemini is never called. The full flow runs in this process with a fake
model and real Supabase clients. The running API is only sent requests
that are refused before the usage gate, so it never calls a provider
either, whatever its AI settings.
"""

import json
from pathlib import Path

import pytest
from supabase import create_client

from ai import preview
from ai.gemini_client import AIError, GeminiResult
from ai.usage_gate import UsageLimitError
from conftest import ANON_KEY, SERVICE_KEY, SUPABASE_URL, add_to_prd, org_prd
from errors import ApiError

FIXTURES = Path(__file__).resolve().parents[2].parent / "shared" / "fixtures" / "prd_document" / "valid"
if not FIXTURES.exists():  # backend container: app/shared is mounted at /shared
    FIXTURES = Path("/shared/fixtures/prd_document/valid")
DRAFT = json.loads((FIXTURES / "full_generated_draft.json").read_text(encoding="utf-8"))["document"]
REQUIRED = {"problem": "Students miss campus events", "target_users": "Students", "goals": "Higher turnout"}


@pytest.fixture(autouse=True)
def ai_on_here(monkeypatch):
    # Only this process; the fake model below is the only "provider".
    monkeypatch.setenv("AI_ENABLED", "true")


def clients(user):
    as_user = create_client(SUPABASE_URL, ANON_KEY)
    as_user.postgrest.auth(user.token)
    return as_user, create_client(SUPABASE_URL, SERVICE_KEY)


def fake_model(during=None):
    calls = []

    def call_model(prompt, **kwargs):
        calls.append(prompt)
        if during:
            during()
        data = {"title": "Campus events PRD", "description": "Help students find events.", "document": DRAFT}
        return GeminiResult(data=data, model="fake-model", prompt_tokens=120, output_tokens=880)
    call_model.calls = calls
    return call_model


def failing_model():
    def call_model(prompt, **kwargs):
        raise AIError(503, "ai_unavailable")
    return call_model


def shared_prd(db, make_org, owner, other, role):
    """An org PRD of owner's, with other on it as role and the required answers."""
    prd_id = org_prd(db, make_org(owner, other), owner, "Shared PRD")
    add_to_prd(db, prd_id, other, role)
    for key, text in REQUIRED.items():
        assert owner.api("PUT", f"/prds/{prd_id}/intake/{key}", json={"answer_text": text}).status_code == 200
    return owner.api("GET", f"/prds/{prd_id}").json()


def ready_prd(user, answers=REQUIRED):
    prd = user.api("POST", "/prds", json={"title": "Campus events"}).json()
    for key, text in answers.items():
        assert user.api("PUT", f"/prds/{prd['id']}/intake/{key}", json={"answer_text": text}).status_code == 200
    return prd


def run(user, prd, model, revision=None):
    as_user, service = clients(user)
    return preview.generate_preview(as_user, service, actor_id=user.id, prd_id=prd["id"],
                                    revision=revision or prd["revision"], call_model=model)


def snapshot(db, prd_id):
    prd = db.execute("select title, content_json, content_text, status, revision, updated_at from prd "
                     "where id = %s", (prd_id,)).fetchone()
    versions = db.execute("select count(*) from prd_version where prd_id = %s", (prd_id,)).fetchone()[0]
    context = db.execute("select context_json, running_summary, version from prd_context where prd_id = %s",
                         (prd_id,)).fetchone()
    return prd, versions, context


def records(db, prd_id):
    return db.execute("select requester_id::text, base_revision, status, error_message, prompt_tokens, "
                      "output_tokens, model from generation_record where prd_id = %s order by created_at",
                      (prd_id,)).fetchall()


def proposals(db, prd_id):
    return db.execute("select requester_id::text, base_revision, kind, status, generation_record_id::text "
                      "from ai_proposal where prd_id = %s", (prd_id,)).fetchall()


def lease(db, user_id):
    return db.execute("select lease_id from ai_usage_gate where user_id = %s", (user_id,)).fetchone()


def test_preview_stages_a_bound_proposal_and_changes_nothing_saved(make_user, db):
    alice = make_user()
    prd = ready_prd(alice)
    prd_before, versions_before, _ = snapshot(db, prd["id"])

    body = run(alice, prd, fake_model())

    assert body["base_revision"] == prd["revision"]
    assert body["proposal"]["content_json"] == DRAFT and body["proposal"]["doc_schema_version"] == 2
    prd_after, versions_after, context = snapshot(db, prd["id"])
    assert prd_after == prd_before and versions_after == versions_before
    assert context == ({}, None, 1)  # an empty context row; nothing accepted into it
    assert records(db, prd["id"]) == [(alice.id, prd["revision"], "success", None, 120, 880, "fake-model")]
    assert proposals(db, prd["id"]) == [(alice.id, prd["revision"], "generate", "pending",
                                         body["generation_record_id"])]
    assert lease(db, alice.id) == (None,)  # released


def test_browsers_cannot_read_or_write_what_the_preview_stored(make_user, db):
    alice = make_user()
    prd = ready_prd(alice)
    run(alice, prd, fake_model())
    assert alice.rest("GET", f"ai_proposal?prd_id=eq.{prd['id']}").status_code in (401, 403)
    r = alice.rest("POST", "generation_record", json={"prd_id": prd["id"], "trigger": "initial_generation",
                                                     "model": "fake", "status": "success"})
    assert r.status_code in (401, 403)
    assert alice.rest("POST", "rpc/ai_record_generation", json={}).status_code in (401, 403, 404)
    assert len(records(db, prd["id"])) == 1


def test_a_second_request_in_the_cooldown_never_reaches_the_model(make_user, db):
    alice = make_user()
    prd = ready_prd(alice)
    run(alice, prd, fake_model())
    model = fake_model()
    with pytest.raises(UsageLimitError) as info:
        run(alice, prd, model)
    assert info.value.code == "ai_cooldown" and info.value.extra["retry_after"] >= 1
    assert model.calls == [] and len(records(db, prd["id"])) == 1


def test_answers_edited_while_generating_are_recorded_not_staged(make_user, db):
    alice = make_user()
    prd = ready_prd(alice)

    def edit():
        alice.api("PUT", f"/prds/{prd['id']}/intake/goals", json={"answer_text": "Different goals"})
    with pytest.raises(ApiError) as info:
        run(alice, prd, fake_model(during=edit))
    assert (info.value.status_code, info.value.code) == (409, "intake_changed")
    assert records(db, prd["id"]) == [(alice.id, prd["revision"], "failed", "intake_changed", 120, 880,
                                       "fake-model")]
    assert proposals(db, prd["id"]) == [] and lease(db, alice.id) == (None,)


def test_a_save_while_generating_is_a_stale_revision(make_user, db):
    alice = make_user()
    prd = ready_prd(alice)

    def save():
        assert alice.api("PUT", f"/prds/{prd['id']}", json={"revision": prd["revision"],
                                                            "title": "Renamed"}).status_code == 200
    with pytest.raises(ApiError) as info:
        run(alice, prd, fake_model(during=save))
    assert (info.value.status_code, info.value.code) == (409, "stale_revision")
    assert [r[2] for r in records(db, prd["id"])] == ["success"] and proposals(db, prd["id"]) == []
    assert lease(db, alice.id) == (None,)


def test_losing_edit_access_while_generating_stages_nothing(make_user, make_org, db):
    owner, alice = make_user(), make_user()
    prd = shared_prd(db, make_org, owner, alice, "editor")

    def demote():  # an owner makes Alice a viewer mid-call
        db.execute("update prd_member set role = 'viewer' where prd_id = %s and user_id = %s", (prd["id"], alice.id))
    with pytest.raises(ApiError) as info:
        run(alice, prd, fake_model(during=demote))
    assert (info.value.status_code, info.value.code) == (403, "forbidden")
    assert [r[3] for r in records(db, prd["id"])] == ["forbidden"] and proposals(db, prd["id"]) == []


# --- through the running API: refusals that happen before any Gemini call ----------


def test_api_refuses_before_the_limit_or_gemini(make_user, make_org, db):
    alice, ben, viewer = make_user(), make_user(), make_user()
    prd = ready_prd(alice)
    empty = alice.api("POST", "/prds", json={"title": "No answers"}).json()

    r = ben.api("POST", f"/prds/{prd['id']}/generate", json={"revision": prd["revision"]})
    assert (r.status_code, r.json()["code"]) == (404, "not_found")
    r = alice.api("POST", f"/prds/{prd['id']}/generate", json={"revision": prd["revision"] + 1})
    assert (r.status_code, r.json()["code"]) == (409, "stale_revision")
    r = alice.api("POST", f"/prds/{empty['id']}/generate", json={"revision": empty["revision"]})
    assert (r.status_code, r.json()["code"]) == (422, "intake_incomplete")
    r = alice.api("POST", f"/prds/{prd['id']}/generate", json={"revision": prd["revision"], "extra": 1})
    assert r.status_code == 422

    shared = shared_prd(db, make_org, ben, viewer, "viewer")  # can read, can't edit
    r = viewer.api("POST", f"/prds/{shared['id']}/generate", json={"revision": shared["revision"]})
    assert (r.status_code, r.json()["code"]) == (403, "forbidden")

    assert records(db, prd["id"]) == [] and records(db, empty["id"]) == [] and records(db, shared["id"]) == []
    for user in (alice, ben, viewer):
        assert lease(db, user.id) is None  # never admitted



# --- saved context (prd_context) in the request ----------------------------------------


def save_context(db, prd_id, decisions, summary):
    db.execute("insert into prd_context (prd_id, context_json, running_summary, version) values (%s, %s, %s, 1) "
               "on conflict (prd_id) do update set context_json = excluded.context_json, "
               "running_summary = excluded.running_summary, version = prd_context.version + 1",
               (prd_id, json.dumps({"decisions": decisions, "constraints": ["No SMS"]}), summary))


def context_row(db, prd_id):
    return db.execute("select context_json, running_summary, version from prd_context where prd_id = %s",
                      (prd_id,)).fetchone()


def sent(model, call=-1):
    return json.loads(model.calls[call])["saved_context"]


def test_saved_context_reaches_the_model_and_follows_updates(make_user, db, monkeypatch):
    monkeypatch.setenv("AI_COOLDOWN_SECONDS", "0")  # two previews in a row
    alice = make_user()
    prd = ready_prd(alice)
    save_context(db, prd["id"], ["Weekly digest first"], "Events app for students.")
    model = fake_model()
    run(alice, prd, model)
    assert sent(model) == {"decisions": ["Weekly digest first"], "constraints": ["No SMS"], "open_questions": [],
                           "running_summary": "Events app for students."}
    save_context(db, prd["id"], ["Push notifications first"], "Updated summary.")
    run(alice, prd, model)
    assert sent(model)["decisions"] == ["Push notifications first"]
    assert sent(model)["running_summary"] == "Updated summary."


def test_context_stays_with_its_own_prd(make_user, db):
    alice = make_user()
    first, second = ready_prd(alice), ready_prd(alice)
    save_context(db, first["id"], ["Only for the first PRD"], "First summary.")
    model = fake_model()
    run(alice, second, model)
    assert "Only for the first PRD" not in model.calls[0] and "First summary" not in model.calls[0]
    assert sent(model)["decisions"] == []


def test_previews_never_change_saved_context(make_user, db, monkeypatch):
    monkeypatch.setenv("AI_COOLDOWN_SECONDS", "0")
    alice = make_user()
    prd = ready_prd(alice)
    save_context(db, prd["id"], ["Weekly digest first"], "Events app for students.")
    before = context_row(db, prd["id"])

    run(alice, prd, fake_model())  # staged
    with pytest.raises(AIError):  # provider failure
        run(alice, prd, failing_model())

    def edit():
        alice.api("PUT", f"/prds/{prd['id']}/intake/goals", json={"answer_text": "Different goals"})
    with pytest.raises(ApiError):  # discarded: answers changed mid-call
        run(alice, prd, fake_model(during=edit))

    assert context_row(db, prd["id"]) == before
    assert [r[2] for r in records(db, prd["id"])] == ["success", "failed", "failed"]
