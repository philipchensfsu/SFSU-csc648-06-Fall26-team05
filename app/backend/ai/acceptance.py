"""Accepting an AI proposal through the normal save (Backend Tasks A05).

There is no separate AI save: the person sends the proposal, edited or not,
to the save with its generation_record_id, and prd_save.save_prd calls
prepare() before the database transaction. The database then uses the
proposal once, under the PRD lock (ai_take_proposal, called from save_prd).

The preview stays editable, so attribution is conservative:
- The version records the save as origin ai_generated with the
  generation_record link and the human who accepted it, whatever they
  changed. That is the authoritative record of AI involvement (v1.2 S03).
- ai_generated marks go only on sections accepted exactly as proposed. An
  edited section gets no new marks, so the editor never highlights text as
  AI-written after a person rewrote it, even partly.
- The staged context patch is applied only when the title, description and
  document were all accepted unchanged. Otherwise it is dropped, so durable
  context never describes model text the person discarded.
"""

from __future__ import annotations

from dataclasses import dataclass

from ai.generation import with_ai_generated_marks
from errors import ApiError

PROPOSAL_UNAVAILABLE = (409, "This AI suggestion is no longer available", "proposal_unavailable")
STALE_REVISION = (409, "This PRD changed since you last loaded it. Refresh and try again.", "stale_revision")
# Kinds this save can accept: whole drafts (A03), section edits (A04) and
# revision suggestions from review feedback (E12).
ACCEPTED_KINDS = ("generate", "ai_edit", "review_suggestion")
SECTION_SCOPE = (422, "Accepting a section edit can only change that section", "proposal_scope")
SUGGESTION_SCOPE = (422, "Accepting a suggestion can only change the sections it suggested", "proposal_scope")


class AcceptanceError(ApiError):
    pass


@dataclass(frozen=True)
class Acceptance:
    content_json: object  # the document to save (marked), or the caller's UNSET
    apply_context_patch: bool
    marked_sections: tuple[str, ...]


def prepare(service_client, *, actor_id, prd_id, base_revision: int, generation_record_id,
            title, description, content_json, unset) -> Acceptance:
    """Checks the proposal and returns what to save. `unset` is the save's
    marker for a field the request didn't include. content_json, when given,
    has already passed the document validator. The database repeats every
    binding check under lock; these are here for clear errors and to read
    the proposal's content, which never changes after staging."""
    rows = (service_client.table("ai_proposal")
            .select("prd_id, requester_id, kind, base_revision, status, content, context_patch")
            .eq("generation_record_id", str(generation_record_id)).execute().data)
    proposal = rows[0] if rows else None
    # "accepted" goes on to the database: a retry after a lost response gets
    # the saved state back if that save is still current, otherwise a 409.
    if (proposal is None or proposal["requester_id"] != str(actor_id) or proposal["prd_id"] != str(prd_id)
            or proposal["status"] not in ("pending", "accepted")):
        raise AcceptanceError(*PROPOSAL_UNAVAILABLE)
    if proposal["base_revision"] != base_revision:
        # Never force a stale proposal through by swapping its base revision.
        raise AcceptanceError(*STALE_REVISION)
    if proposal["kind"] not in ACCEPTED_KINDS:
        raise AcceptanceError(422, "This kind of AI suggestion can't be accepted yet", "unsupported_proposal")

    proposed = proposal["content"]
    if proposal["kind"] == "ai_edit":
        return _prepare_scoped(service_client, prd_id, {proposed["section_type"]}, [proposed["section"]],
                               str(generation_record_id), title, description, content_json, unset, SECTION_SCOPE)
    if proposal["kind"] == "review_suggestion":
        return _prepare_scoped(service_client, prd_id, set(proposed["section_types"]), proposed["sections"],
                               str(generation_record_id), title, description, content_json, unset, SUGGESTION_SCOPE)
    if content_json is unset:
        marked, marked_sections = unset, ()
    else:
        if str(generation_record_id) in _mark_ids(content_json):
            # Only the backend applies the mark for this generation.
            raise AcceptanceError(422, "The AI content in this save doesn't match a successful generation",
                                  "invalid_generation_record")
        marked, marked_sections = _mark_unedited_sections(content_json, proposed["content_json"],
                                                          str(generation_record_id))

    unedited = (title is not unset and title == proposed["title"]
                and description is not unset and description == proposed["description"]
                and content_json is not unset and content_json == proposed["content_json"])
    return Acceptance(content_json=marked,
                      apply_context_patch=unedited and proposal["context_patch"] is not None,
                      marked_sections=marked_sections)


def _prepare_scoped(service_client, prd_id, targets: set, proposed_sections: list, generation_record_id: str,
                    title, description, content_json, unset, scope_error) -> Acceptance:
    """A section edit (one section) or a review suggestion (the sections it
    suggested) changes those sections and nothing else. Every other section
    must match the saved document, and title and description are left out.
    A suggested section is marked ai_generated only if accepted exactly as
    proposed; an edited one is saved without the mark."""
    if content_json is unset or title is not unset or description is not unset:
        raise AcceptanceError(*scope_error)
    if generation_record_id in _mark_ids(content_json):
        raise AcceptanceError(422, "The AI content in this save doesn't match a successful generation",
                              "invalid_generation_record")
    saved = (service_client.table("prd").select("content_json").eq("id", str(prd_id)).execute().data or [{}])[0]
    saved_others = _sections_except(saved.get("content_json") or {}, targets)
    if _sections_except(content_json, targets) != saved_others:
        raise AcceptanceError(*scope_error)
    marked, marked_sections = _mark_unedited_sections(
        content_json, {"content": proposed_sections}, generation_record_id)
    return Acceptance(content_json=marked, apply_context_patch=False, marked_sections=marked_sections)


def _sections_except(document: dict, section_types: set) -> list:
    return [s for s in document.get("content", []) if s.get("attrs", {}).get("type") not in section_types]


def _mark_unedited_sections(document: dict, proposed: dict, generation_record_id: str):
    proposed_sections = {section["attrs"]["type"]: section for section in proposed.get("content", [])}
    content, marked = [], []
    for section in document.get("content", []):
        section_type = section["attrs"]["type"]
        if proposed_sections.get(section_type) == section:
            section = with_ai_generated_marks(section, generation_record_id)
            marked.append(section_type)
        content.append(section)
    return {**document, "content": content}, tuple(marked)


def _mark_ids(node: dict) -> set[str]:
    found, stack = set(), [node]
    while stack:
        current = stack.pop()
        for mark in current.get("marks", []):
            if mark.get("type") == "ai_generated":
                found.add(mark.get("attrs", {}).get("generation_record_id"))
        stack.extend(current.get("content", []))
    return found
