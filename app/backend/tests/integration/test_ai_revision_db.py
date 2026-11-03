"""Conversational AI revisions against the local stack: request -> staged
ai_revision proposal (the new kind, so this also checks the migration) ->
acceptance of the whole proposal through the save core, with real RLS, A02
staging and A05's once-only take. Also the eligibility rule shared with
section edits: on an approved PRD only owners may ask, refused before the
usage gate. Gemini isn't called and Om's modules are doubles."""

import copy
import json

import pytest

from ai import chat_revision, section_edit
from ai.acceptance import AcceptanceError
from ai.gemini_client import GeminiResult
from errors import ApiError
from prd_save import SaveError, save_prd
from test_ai_edit_db import DOC, NEW_GOALS, as_user, cast, doubles, proposal_status, service, state, verified  # noqa: F401

NEW_METRICS = {"type": "section", "attrs": {"type": "success_metrics"}, "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "40% of new users finish a draft in their first week."}]}]}


@pytest.fixture(autouse=True)
def ai_on_here(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("AI_COOLDOWN_SECONDS", "0")


def fake_model(prompt, **kwargs):
    return GeminiResult(data={"sections": [NEW_GOALS, NEW_METRICS], "explanation": "Made both measurable."},
                        model="fake", prompt_tokens=5, output_tokens=7)


def request_revision(user, prd, service, revision=2):
    return chat_revision.propose_revision(
        as_user(user), service, actor_id=user.id, prd_id=prd, revision=revision,
        instruction="Apply what we discussed.", session_messages=[{"role": "user", "content": "Measurable, please."}],
        modules=doubles(), call_model=fake_model)


def accept(user, prd, service, body, content=None, **fields):
    return save_prd(service, verified(service, user), prd, body["base_revision"],
                    content_json=body["proposal"]["content_json"] if content is None else content,
                    origin="ai_generated", generation_record_id=body["generation_record_id"], **fields)


def test_editor_previews_then_accepts_changes_across_sections(cast, db, service):
    before = state(db, cast["prd"])
    body = request_revision(cast["editor"], cast["prd"], service)
    assert body["kind"] == "proposal" and body["proposal"]["section_types"] == ["goals", "success_metrics"]
    assert state(db, cast["prd"]) == before  # nothing saved by the request
    assert proposal_status(db, body["generation_record_id"]) == ("ai_revision", "pending")

    saved = accept(cast["editor"], cast["prd"], service, body)
    assert saved["revision"] == 3
    for old, new in zip(DOC["content"], saved["content_json"]["content"]):
        if old["attrs"]["type"] in ("goals", "success_metrics"):
            assert body["generation_record_id"] in json.dumps(new)
        else:
            assert new == old  # untouched sections survive exactly
    assert proposal_status(db, body["generation_record_id"]) == ("ai_revision", "accepted")
    version = db.execute("select origin, generation_record_id::text, changed_sections from prd_version "
                         "where prd_id = %s order by version_no desc limit 1", (cast["prd"],)).fetchone()
    assert version == ("ai_generated", body["generation_record_id"], ["goals", "success_metrics"])


@pytest.mark.parametrize("fields", [{"title": "Edit me"}, {"description": None}])
def test_acceptance_refuses_title_and_description_even_unchanged(cast, db, service, fields):
    body = request_revision(cast["editor"], cast["prd"], service)
    with pytest.raises(AcceptanceError) as info:
        accept(cast["editor"], cast["prd"], service, body, **fields)
    assert info.value.code == "proposal_scope"
    assert proposal_status(db, body["generation_record_id"]) == ("ai_revision", "pending")


def test_acceptance_cannot_slip_in_other_changes_or_go_stale(cast, db, service):
    body = request_revision(cast["editor"], cast["prd"], service)
    sneaky = copy.deepcopy(body["proposal"]["content_json"])
    sneaky["content"][0]["content"][0]["content"][0]["text"] = "Changed problem statement."
    with pytest.raises(AcceptanceError) as info:
        accept(cast["editor"], cast["prd"], service, body, content=sneaky)
    assert info.value.code == "proposal_scope"

    save_prd(service, verified(service, cast["owner"]), cast["prd"], 2, title="Renamed meanwhile")
    with pytest.raises(SaveError) as info:
        accept(cast["editor"], cast["prd"], service, body)
    assert info.value.code == "stale_revision"
    assert proposal_status(db, body["generation_record_id"]) == ("ai_revision", "pending")


@pytest.mark.parametrize("request_change", [request_revision, lambda user, prd, service: section_edit.propose_section_edit(
    as_user(user), service, actor_id=user.id, prd_id=prd, revision=2, section_type="goals", instruction="x",
    session_messages=[], modules=doubles(), call_model=fake_model)])
def test_on_an_approved_prd_only_owners_may_ask(cast, db, service, request_change):
    db.execute("update prd set status = 'final' where id = %s", (cast["prd"],))
    with pytest.raises(ApiError) as info:
        request_change(cast["editor"], cast["prd"], service)
    assert (info.value.status_code, info.value.code) == (403, "owner_required")
    with pytest.raises(ApiError) as info:
        request_change(cast["viewer"], cast["prd"], service)
    assert (info.value.status_code, info.value.code) == (403, "forbidden")
    # Refused before the usage gate: nothing recorded, no quota used.
    assert db.execute("select count(*) from generation_record where prd_id = %s", (cast["prd"],)).fetchone() == (0,)
    for user in (cast["editor"], cast["viewer"]):
        assert db.execute("select count(*) from ai_usage_gate where user_id = %s", (user.id,)).fetchone() == (0,)


def test_owners_may_still_ask_on_an_approved_prd(cast, db, service):
    db.execute("update prd set status = 'final' where id = %s", (cast["prd"],))
    body = request_revision(cast["owner"], cast["prd"], service)
    assert body["kind"] == "proposal"
    assert proposal_status(db, body["generation_record_id"]) == ("ai_revision", "pending")


def test_the_database_accepts_only_known_proposal_kinds(db):
    kinds = db.execute("select pg_get_constraintdef(oid) from pg_constraint "
                       "where conname = 'ai_proposal_kind_check'").fetchone()[0]
    for kind in ("generate", "ai_edit", "review_suggestion", "ai_revision"):
        assert f"'{kind}'" in kinds
