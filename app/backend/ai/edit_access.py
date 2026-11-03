"""Who may ask the AI for a change to a PRD's document (Marco, 2026-11-02).

Asking for a document-edit proposal (generate, ai-edit, ai-revisions) takes
the same right as saving one: edit access (owners, editors, org admins), and
once the PRD is approved (final, assigned), owners only (Decision 9, E09).
Without this, an editor could spend the AI quota on a proposal the save would
then refuse. Review suggestions (E12) stay owner-only on their own check, and
answer-only chat stays open to viewers.

The rule is the database's: prd_capabilities' can_edit flag, the same one the
frontend shows the buttons from, asked as the user. Routes check it before
the usage gate and the model call, and again before staging.
"""

from __future__ import annotations

from errors import ApiError

# Same code and wording as the save's refusal (prd_save NTOWN).
OWNER_REQUIRED = (403, "Only the PRD's owners can edit it after approval.", "owner_required")
CANNOT_EDIT = (403, "You don't have permission to edit this PRD.", "forbidden")


def can_request_edit(user_client, prd_id: str) -> bool:
    """True when the caller could save a change to this PRD's document now."""
    flags = user_client.rpc("prd_capabilities", {"target_prd": prd_id}).execute().data
    return isinstance(flags, dict) and flags.get("can_edit") is True


def require_edit_request(user_client, prd_id: str, forbidden: tuple = CANNOT_EDIT) -> None:
    """Raises 403 unless the caller may ask for a document change. Someone
    with edit access who is refused only because the PRD is approved gets
    owner_required; anyone else gets `forbidden`, so each route keeps its own
    wording."""
    if can_request_edit(user_client, prd_id):
        return
    if user_client.rpc("can_edit_prd", {"target_prd_id": prd_id}).execute().data is True:
        raise ApiError(*OWNER_REQUIRED)
    raise ApiError(*forbidden)
