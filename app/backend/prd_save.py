"""S03 save core: the single path for saving a PRD's title, description and content.

save_prd() checks the input in Python (title rules, description length, the
PRD document validator), derives content_text on the server, collects the
generation records named by ai_generated marks, then calls the save_prd
database function, which does everything else in one transaction: lock the
PRD, check access and the revision, verify AI provenance, write a permanent
version and update the PRD.

Accepting an AI proposal is the same save with origin="ai_generated" and its
generation_record_id (A05): ai/acceptance.py checks the proposal and marks
the sections accepted unchanged, and the database uses the proposal once in
the save transaction.

Not wired into any route yet. Today's PUT /api/prds/{id} keeps its direct
update until the S03 cutover. Status is never part of a save (D6).

The database function only accepts calls made with the service role, so a
browser can't skip the validation here by calling it directly. Pass the
service-role client and the user object get_current_user verified
(auth["user"]), never an id from the request: the function checks that
user's permissions with the shared RLS helpers.
"""

from uuid import UUID

from postgrest.exceptions import APIError

from ai import acceptance
from errors import ApiError
from prd_document import InvalidDocument, derive_content_text, load_spec, validate_title

UNSET = object()

ORIGINS = ("pm_edit", "ai_generated")

# SQLSTATEs raised by the save_prd database function.
DATABASE_ERRORS = {
    "NT404": (404, "PRD not found", "not_found"),
    "NT403": (403, "You can view this PRD but not edit it", "forbidden"),
    "NT409": (409, "This PRD changed since you last loaded it. Refresh and try again.", "stale_revision"),
    "NT422": (422, "The AI content in this save doesn't match a successful generation", "invalid_generation_record"),
    "NTREV": (409, "Approved PRDs can't be edited until reapproval is in place", "review_integration_pending"),
    "NTPRP": acceptance.PROPOSAL_UNAVAILABLE,
}


class SaveError(ApiError):
    """An ApiError that may also carry per-field or per-node errors."""

    def __init__(self, status_code: int, detail: str, code: str, errors: list[dict] | None = None):
        super().__init__(status_code, detail, code)
        self.errors = errors or []
        if self.errors:
            # Rendered into the body by the shared S01 handler.
            self.extra = {"errors": self.errors}


def save_prd(service_client, verified_user, prd_id, base_revision: int, *, title=UNSET, description=UNSET,
             content_json=UNSET, origin: str = "pm_edit", generation_record_id=None) -> dict:
    """Saves the given fields of one PRD and returns the saved row.

    verified_user is auth["user"] from get_current_user: the actor comes from
    the verified token, so no request value can become it.

    Fields left as UNSET keep their current value. description=None clears it.
    A save that changes nothing returns the current row without a new revision.
    """
    actor_id = verified_actor_id(verified_user)
    if isinstance(base_revision, bool) or not isinstance(base_revision, int) or base_revision < 1:
        raise SaveError(422, "Invalid base revision", "validation_error")
    if origin not in ORIGINS:
        raise SaveError(422, "Unknown save origin", "validation_error")
    if (origin == "ai_generated") != (generation_record_id is not None):
        raise SaveError(422, "Only an AI save names a generation record, and it must", "validation_error")

    if title is not UNSET:
        problems = validate_title(title)
        if problems:
            raise SaveError(422, problems[0].message, "invalid_title", [p.to_dict() for p in problems])

    if description is not UNSET and description is not None:
        limit = load_spec()["limits"]["max_description_chars"]["value"]
        if not isinstance(description, str) or len(description) > limit:
            raise SaveError(422, f"The description must be text of at most {limit} characters",
                            "invalid_description")

    content_text = None
    ai_ids = []
    if content_json is not UNSET:
        try:
            content_text = derive_content_text(content_json)
        except InvalidDocument as invalid:
            raise SaveError(422, "The PRD document isn't valid", "invalid_document",
                            [error.to_dict() for error in invalid.errors]) from None

    apply_context_patch = False
    if generation_record_id is not None:
        accepted = acceptance.prepare(service_client, actor_id=actor_id, prd_id=prd_id,
                                      base_revision=base_revision, generation_record_id=generation_record_id,
                                      title=title, description=description, content_json=content_json,
                                      unset=UNSET)
        content_json = accepted.content_json
        apply_context_patch = accepted.apply_context_patch
        if content_json is not UNSET:
            # Validates the marked document too; the text itself is unchanged.
            content_text = derive_content_text(content_json)
    if content_json is not UNSET:
        ai_ids = sorted(generation_record_ids(content_json))

    params = {
        "p_actor": str(actor_id),
        "p_prd_id": str(prd_id),
        "p_base_revision": base_revision,
        "p_set_title": title is not UNSET,
        "p_title": None if title is UNSET else title,
        "p_set_description": description is not UNSET,
        "p_description": None if description is UNSET else description,
        "p_set_content": content_json is not UNSET,
        "p_content_json": None if content_json is UNSET else content_json,
        "p_content_text": content_text,
        "p_ai_generation_ids": ai_ids,
        "p_origin": origin,
        "p_generation_record_id": None if generation_record_id is None else str(generation_record_id),
        "p_apply_context_patch": apply_context_patch,
    }
    try:
        response = service_client.rpc("save_prd", params).execute()
    except APIError as exc:
        known = DATABASE_ERRORS.get(exc.code or "")
        if known is None:
            raise  # the shared S01 handler turns it into a safe 4xx/500
        status, detail, code = known
        raise SaveError(status, detail, code) from None
    return response.data


def verified_actor_id(verified_user) -> str:
    """The id of the user object get_current_user verified. A plain id or
    string is refused, so a value from the request can't be passed by
    mistake."""
    if isinstance(verified_user, (str, bytes, UUID)) or not getattr(verified_user, "id", None):
        raise TypeError("save_prd needs the verified auth['user'], not an id")
    return str(verified_user.id)


def generation_record_ids(document: dict) -> set[str]:
    """The generation_record_id of every ai_generated mark in a valid document."""
    found = set()
    stack = [document]
    while stack:
        node = stack.pop()
        for mark in node.get("marks", []):
            if mark["type"] == "ai_generated":
                found.add(mark["attrs"]["generation_record_id"])
        stack.extend(node.get("content", []))
    return found
