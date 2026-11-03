"""Accepting an AI proposal through the save (ai/acceptance.py via prd_save).

A fake service client serves the staged proposal and records the save_prd
call. Taking the proposal once under the PRD lock, replay and rollback are
checked against Postgres in tests/integration/test_accept_proposal.py.
Run from app/backend with: python -m pytest tests/test_acceptance.py
"""

import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from ai.acceptance import AcceptanceError
from prd_save import save_prd

FIXTURES = Path(__file__).resolve().parent.parent.parent / "shared" / "fixtures" / "prd_document" / "valid"
DRAFT = json.loads((FIXTURES / "full_generated_draft.json").read_text(encoding="utf-8"))["document"]
ACTOR = "22222222-2222-4222-8222-222222222222"
OTHER = "66666666-6666-4666-8666-666666666666"
PRD = "11111111-1111-4111-8111-111111111111"
RECORD = "33333333-3333-4333-8333-333333333333"
PATCH = {"decisions": ["Weekly digest first"]}
USER = SimpleNamespace(id=ACTOR)  # auth["user"] from get_current_user


def proposal(**changes):
    row = {"prd_id": PRD, "requester_id": ACTOR, "kind": "generate", "base_revision": 3, "status": "pending",
           "context_patch": PATCH,
           "content": {"title": "Campus events PRD", "description": "Help students find events.",
                       "content_json": DRAFT, "doc_schema_version": 2}}
    row.update(changes)
    return row


class FakeService:
    def __init__(self, row):
        self.row, self.calls = row, []

    def table(self, name):
        assert name == "ai_proposal"
        query = SimpleNamespace(execute=lambda: SimpleNamespace(data=[self.row] if self.row else []))
        query.select = lambda *_: query
        query.eq = lambda column, value: query
        return query

    def rpc(self, name, params):
        self.calls.append(params)
        return SimpleNamespace(execute=lambda: SimpleNamespace(data={"id": PRD, "revision": 4}))


def accept(service, *, title="Campus events PRD", description="Help students find events.", content=None,
           revision=3):
    return save_prd(service, USER, PRD, revision, title=title, description=description,
                    content_json=copy.deepcopy(DRAFT) if content is None else content,
                    origin="ai_generated", generation_record_id=RECORD)


def ai_marked_sections(document):
    def marked(node):
        if node.get("type") == "text":
            return any(m["type"] == "ai_generated" and m["attrs"]["generation_record_id"] == RECORD
                       for m in node.get("marks", []))
        return any(marked(child) for child in node.get("content", []))
    return [s["attrs"]["type"] for s in document["content"] if marked(s)]


def all_text_marked(section):
    if section.get("type") == "text":
        return any(m["type"] == "ai_generated" for m in section.get("marks", []))
    return all(all_text_marked(child) for child in section.get("content", []))


def edit_section(document, section_type, text):
    edited = copy.deepcopy(document)
    for section in edited["content"]:
        if section["attrs"]["type"] == section_type:
            section["content"] = [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]
    return edited


# --- unedited --------------------------------------------------------------------


def test_unedited_acceptance_marks_every_section_and_applies_context():
    service = FakeService(proposal())
    accept(service)
    params = service.calls[0]
    saved = params["p_content_json"]
    assert ai_marked_sections(saved) == [s["attrs"]["type"] for s in DRAFT["content"]]
    assert all(all_text_marked(s) for s in saved["content"])
    assert params["p_apply_context_patch"] is True
    assert params["p_ai_generation_ids"] == [RECORD]
    assert params["p_origin"] == "ai_generated" and params["p_generation_record_id"] == RECORD


def test_marks_dont_change_the_saved_text():
    service = FakeService(proposal())
    accept(service)
    unmarked = FakeService(proposal())
    save_prd(unmarked, USER, PRD, 3, content_json=copy.deepcopy(DRAFT))
    assert service.calls[0]["p_content_text"] == unmarked.calls[0]["p_content_text"]


def test_no_context_patch_means_none_applied():
    service = FakeService(proposal(context_patch=None))
    accept(service)
    assert service.calls[0]["p_apply_context_patch"] is False


# --- edited before accepting --------------------------------------------------------


def test_edited_section_gets_no_marks_and_context_is_dropped():
    service = FakeService(proposal())
    edited = edit_section(DRAFT, "goals", "Our own goals")
    accept(service, content=edited)
    params = service.calls[0]
    marked = ai_marked_sections(params["p_content_json"])
    assert "goals" not in marked and len(marked) == len(DRAFT["content"]) - 1
    assert params["p_apply_context_patch"] is False  # don't merge context about discarded text


def test_edited_title_or_description_drops_context_but_keeps_marks():
    for kwargs in ({"title": "Our title"}, {"description": "Ours"}):
        service = FakeService(proposal())
        accept(service, **kwargs)
        assert service.calls[0]["p_apply_context_patch"] is False
        assert len(ai_marked_sections(service.calls[0]["p_content_json"])) == len(DRAFT["content"])


def test_removed_and_added_sections():
    service = FakeService(proposal())
    fewer = copy.deepcopy(DRAFT)
    fewer["content"] = fewer["content"][1:]
    accept(service, content=fewer)
    assert ai_marked_sections(service.calls[0]["p_content_json"]) == [s["attrs"]["type"] for s in fewer["content"]]
    assert service.calls[0]["p_apply_context_patch"] is False


def test_accepting_only_the_title_saves_no_document():
    service = FakeService(proposal())
    save_prd(service, USER, PRD, 3, title="Campus events PRD", origin="ai_generated",
             generation_record_id=RECORD)
    params = service.calls[0]
    assert not params["p_set_content"] and params["p_apply_context_patch"] is False


def test_client_cannot_send_marks_for_the_proposal_itself():
    service = FakeService(proposal())
    forged = copy.deepcopy(DRAFT)
    text = forged["content"][0]["content"][0]["content"][0]
    text["marks"] = [{"type": "ai_generated", "attrs": {"generation_record_id": RECORD}}]
    with pytest.raises(AcceptanceError) as info:
        accept(service, content=forged)
    assert (info.value.status_code, info.value.code) == (422, "invalid_generation_record")
    assert service.calls == []


# --- refused before the database ---------------------------------------------------


@pytest.mark.parametrize("row, status, code", [
    (None, 409, "proposal_unavailable"),
    (proposal(requester_id=OTHER), 409, "proposal_unavailable"),
    (proposal(prd_id="77777777-7777-4777-8777-777777777777"), 409, "proposal_unavailable"),
    (proposal(status="expired"), 409, "proposal_unavailable"),
    (proposal(status="rejected"), 409, "proposal_unavailable"),
    (proposal(base_revision=2), 409, "stale_revision"),
    (proposal(kind="something_new"), 422, "unsupported_proposal"),  # a kind this save doesn't know
])
def test_unusable_proposals_never_reach_the_save(row, status, code):
    service = FakeService(row)
    with pytest.raises(AcceptanceError) as info:
        accept(service)
    assert (info.value.status_code, info.value.code) == (status, code)
    assert service.calls == []


def test_invalid_edited_document_is_refused_before_the_proposal_is_read():
    service = FakeService(proposal())
    broken = copy.deepcopy(DRAFT)
    broken["content"][0]["attrs"]["type"] = "not_a_section"
    with pytest.raises(Exception) as info:
        accept(service, content=broken)
    assert info.value.code == "invalid_document" and service.calls == []


def test_an_accepted_proposal_goes_to_the_database_for_replay_handling():
    service = FakeService(proposal(status="accepted"))
    accept(service)
    assert len(service.calls) == 1
