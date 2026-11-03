"""S03 save core: the Python half of prd_save.save_prd (no database needed).

The database half (locking, revisions, versions, permissions, provenance) is
checked against Postgres; see the PR description.
"""

import json
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from postgrest.exceptions import APIError

from prd_save import SaveError, generation_record_ids, save_prd

FIXTURES = Path(__file__).resolve().parent.parent.parent / "shared" / "fixtures" / "prd_document"
ACTOR = "00000000-0000-0000-0000-0000000000a1"
PRD = "00000000-0000-0000-0000-000000000101"
RECORD = "3f2c9a1e-8b4d-4c6a-9e2f-1a7b5c3d9e01"
# What get_current_user puts in auth["user"]: an object with the verified id.
USER = SimpleNamespace(id=ACTOR, email="alice@example.com")


def fixture(kind, name):
    return json.loads((FIXTURES / kind / f"{name}.json").read_text(encoding="utf-8"))


class FakeService:
    """Records the rpc call and returns a canned row, or raises a database error.
    Serves one staged proposal for AI saves."""

    def __init__(self, error_code=None, proposal=None, message="from postgres", saved=None, prd_now=None):
        self.error_code, self.calls, self.proposal, self.message = error_code, [], proposal, message
        # The row save_prd returns, and what a re-read of the PRD sees after
        # the save (the status E09 left); no re-read row unless given.
        self.saved = saved or {"id": PRD, "revision": 2}
        self.prd_now, self.reads = prd_now, 0

    def table(self, name):
        assert name in ("ai_proposal", "prd")
        if name == "prd":
            self.reads += 1
        rows = ([self.proposal] if self.proposal else []) if name == "ai_proposal" else (
            [self.prd_now] if self.prd_now else [])
        query = SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))
        query.select = lambda *_: query
        query.eq = lambda *_: query
        return query

    def rpc(self, name, params):
        self.calls.append((name, params))
        return self

    def execute(self):
        if self.error_code:
            raise APIError({"code": self.error_code, "message": self.message})
        return SimpleNamespace(data=dict(self.saved))


def test_title_only_save_sends_only_the_title():
    service = FakeService()
    assert save_prd(service, USER, PRD, 1, title="New title") == {"id": PRD, "revision": 2}
    name, params = service.calls[0]
    assert name == "save_prd"
    assert params["p_set_title"] and params["p_title"] == "New title"
    assert not params["p_set_description"] and not params["p_set_content"]
    assert params["p_content_text"] is None and params["p_ai_generation_ids"] == []
    assert params["p_origin"] == "pm_edit" and params["p_generation_record_id"] is None


def test_content_save_sends_server_derived_text_and_ai_ids():
    case = fixture("valid", "marks")
    service = FakeService()
    save_prd(service, USER, PRD, 3, content_json=case["document"])
    params = service.calls[0][1]
    assert params["p_set_content"] and params["p_content_json"] == case["document"]
    assert params["p_content_text"] == case["expect"]["content_text"]
    assert params["p_ai_generation_ids"] == [RECORD]


def test_description_can_be_cleared():
    service = FakeService()
    save_prd(service, USER, PRD, 1, description=None)
    params = service.calls[0][1]
    assert params["p_set_description"] and params["p_description"] is None


def test_an_ai_save_names_its_generation_record():
    empty = fixture("valid", "empty_draft")["document"]
    service = FakeService(proposal={"prd_id": PRD, "requester_id": ACTOR, "kind": "generate", "base_revision": 1,
                                    "status": "pending", "context_patch": None,
                                    "content": {"title": "T", "description": "", "content_json": empty}})
    save_prd(service, USER, PRD, 1, content_json=fixture("valid", "empty_draft")["document"],
             origin="ai_generated", generation_record_id=RECORD)
    params = service.calls[0][1]
    assert params["p_origin"] == "ai_generated" and params["p_generation_record_id"] == RECORD
    assert params["p_apply_context_patch"] is False


@pytest.mark.parametrize("kwargs, code", [
    ({"title": "  "}, "invalid_title"),
    ({"title": "x" * 201}, "invalid_title"),
    ({"description": "x" * 2001}, "invalid_description"),
    ({"description": 5}, "invalid_description"),
    ({"origin": "status_change"}, "validation_error"),
    ({"origin": "ai_generated"}, "validation_error"),
    ({"generation_record_id": RECORD}, "validation_error"),
])
def test_bad_input_never_reaches_the_database(kwargs, code):
    service = FakeService()
    with pytest.raises(SaveError) as caught:
        save_prd(service, USER, PRD, 1, **kwargs)
    assert caught.value.code == code and caught.value.status_code == 422
    assert service.calls == []


@pytest.mark.parametrize("revision", [0, -1, True, "1", None])
def test_bad_base_revision_is_rejected(revision):
    with pytest.raises(SaveError):
        save_prd(FakeService(), USER, PRD, revision, title="t")


def test_invalid_documents_return_every_error_and_skip_the_database():
    case = fixture("invalid", "several_errors")
    service = FakeService()
    with pytest.raises(SaveError) as caught:
        save_prd(service, USER, PRD, 1, content_json=case["document"])
    assert caught.value.code == "invalid_document" and caught.value.status_code == 422
    assert [{"code": e["code"], "path": e["path"]} for e in caught.value.errors] == case["expect"]["document_errors"]
    assert service.calls == []


def test_v1_content_is_rejected():
    service = FakeService()
    with pytest.raises(SaveError) as caught:
        save_prd(service, USER, PRD, 1, content_json=fixture("invalid", "legacy_v1_sections")["document"])
    assert caught.value.code == "invalid_document"


@pytest.mark.parametrize("sqlstate, status, code", [
    ("NT404", 404, "not_found"),
    ("NT403", 403, "forbidden"),
    ("NT409", 409, "stale_revision"),
    ("NT422", 422, "invalid_generation_record"),
    ("NTREV", 409, "reapproval_required"),
    ("NTOWN", 403, "owner_required"),
    ("NTCRL", 422, "confirmed_reviewers_not_allowed"),
    ("NTPRP", 409, "proposal_unavailable"),
])
def test_database_errors_map_to_api_errors(sqlstate, status, code):
    with pytest.raises(SaveError) as caught:
        save_prd(FakeService(sqlstate), USER, PRD, 1, title="t")
    assert (caught.value.status_code, caught.value.code) == (status, code)
    assert "postgres" not in caught.value.detail


def test_other_database_errors_go_to_the_shared_handler():
    with pytest.raises(APIError):
        save_prd(FakeService("23514"), USER, PRD, 1, title="t")


def test_generation_record_ids_finds_nested_marks():
    document = fixture("valid", "generation_rejects_ai_mark")["document"]
    assert generation_record_ids(document) == {RECORD}
    assert generation_record_ids(fixture("valid", "empty_draft")["document"]) == set()


def test_the_actor_is_the_verified_users_id():
    service = FakeService()
    save_prd(service, USER, PRD, 1, title="New title")
    assert service.calls[0][1]["p_actor"] == ACTOR


@pytest.mark.parametrize("actor", [ACTOR, uuid.UUID(ACTOR), None, SimpleNamespace(id=None)])
def test_a_raw_id_is_never_accepted_as_the_actor(actor):
    service = FakeService()
    with pytest.raises(TypeError):
        save_prd(service, actor, PRD, 1, title="New title")
    assert service.calls == []


@pytest.mark.parametrize("message, status, code", [
    ("no_reviewers", 422, "validation_error"),
    ("reviewer_not_in_organization", 422, "not_in_organization"),
    ("owner_cannot_review", 422, "owner_cannot_review"),
    ("empty_prd", 422, "empty_prd"),
    ("approved_round_needs_owner", 409, "reapproval_required"),
])
def test_review_errors_from_the_round_functions_map_to_api_errors(message, status, code):
    with pytest.raises(SaveError) as caught:
        save_prd(FakeService("P0001", message=message), USER, PRD, 1, title="t", confirmed_reviewer_ids=[])
    assert (caught.value.status_code, caught.value.code) == (status, code)


def test_other_p0001_errors_go_to_the_shared_handler():
    with pytest.raises(APIError):
        save_prd(FakeService("P0001", message="something_else"), USER, PRD, 1, title="t")


def test_confirmed_reviewers_are_sent_as_ids_and_default_to_none():
    service = FakeService()
    save_prd(service, USER, PRD, 1, title="t")
    assert service.calls[0][1]["p_confirmed_reviewers"] is None
    reviewer = "11111111-1111-1111-1111-111111111111"
    save_prd(service, USER, PRD, 1, title="t", confirmed_reviewer_ids=[reviewer.upper()])
    assert service.calls[1][1]["p_confirmed_reviewers"] == [reviewer]


def test_a_confirmed_edit_returns_the_status_the_new_round_left():
    # save_prd captures its row before E09 opens the new round, so the row
    # still says final; the status is read again for this revision.
    service = FakeService(saved={"id": PRD, "revision": 2, "status": "final"},
                          prd_now={"revision": 2, "status": "in_review"})
    saved = save_prd(service, USER, PRD, 1, title="t", confirmed_reviewer_ids=["11111111-1111-1111-1111-111111111111"])
    assert saved == {"id": PRD, "revision": 2, "status": "in_review"}


def test_an_edit_that_ends_the_round_returns_draft():
    # E09 ends an open round (the edit emptied the PRD, or no reviewer can
    # take part) after the row is captured; no reviewer list is sent.
    service = FakeService(saved={"id": PRD, "revision": 2, "status": "in_review"},
                          prd_now={"revision": 2, "status": "draft"})
    assert save_prd(service, USER, PRD, 1, title="t")["status"] == "draft"


def test_a_later_save_by_someone_else_is_never_returned_as_this_one():
    service = FakeService(saved={"id": PRD, "revision": 2, "status": "final"},
                          prd_now={"revision": 3, "status": "in_review"})
    saved = save_prd(service, USER, PRD, 1, title="t", confirmed_reviewer_ids=["11111111-1111-1111-1111-111111111111"])
    assert saved == {"id": PRD, "revision": 2, "status": "final"}


def test_a_drafts_save_is_returned_as_the_database_gave_it():
    service = FakeService(saved={"id": PRD, "revision": 2, "status": "draft"},
                          prd_now={"revision": 2, "status": "in_review"})
    assert save_prd(service, USER, PRD, 1, title="t") == {"id": PRD, "revision": 2, "status": "draft"}
    assert service.reads == 0  # a draft's save changes no review, so nothing is read again


@pytest.mark.parametrize("bad", [["not-an-id"], [None], ["11111111-1111-1111-1111-111111111111"] * 51])
def test_bad_confirmed_reviewer_lists_are_refused_before_the_database(bad):
    service = FakeService()
    with pytest.raises(SaveError) as caught:
        save_prd(service, USER, PRD, 1, title="t", confirmed_reviewer_ids=bad)
    assert caught.value.code == "validation_error" and service.calls == []


def test_an_empty_doc_without_content_saves_with_empty_text():
    # TipTap's getJSON() omits content for an empty document; this used to
    # crash derive_content_text (KeyError) after passing validation.
    service = FakeService()
    save_prd(service, USER, PRD, 1, content_json={"type": "doc"})
    params = service.calls[0][1]
    assert params["p_content_json"] == {"type": "doc"} and params["p_content_text"] == ""
