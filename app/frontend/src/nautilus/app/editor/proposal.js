// Conversational AI revisions (POST /api/prds/{id}/ai-revisions): asking for
// a proposal, accepting it through the save, and what their errors say.
// The editor wires these to the chat and the comparison view.
//
// The rules this keeps (docs/frontend-api.md, "AI revisions from the chat"):
// - The comparison's "current" side and the request's base revision come from
//   one fresh read of the PRD, so the proposal is compared with exactly the
//   document it was made from. Keep that original fixed while it's shown.
// - Accepting sends the server's proposed document exactly as received, with
//   generation_record_id and without title or description: the save refuses
//   either, even unchanged (proposal_scope).
// - A save whose response was lost is sent once more as it was. The server
//   answers a repeat of an accepted proposal with the saved PRD, so nothing
//   is applied twice. A 409 is a real conflict and is never retried.
import { describeGenerationError } from "./aiDraft";

const EMPTY_DOCUMENT = { type: "doc", content: [] };
// The backend takes at most 20 recent turns (chat.MAX_HISTORY_MESSAGES).
const MAX_SESSION_MESSAGES = 20;

// The chat's turns ({ from: "you" | "ai", text }) as session_messages, the
// most recent ones only. Refusals and clarifications are left out: they're
// fixed text, not part of the discussion. A proposal's explanation stays, so
// a follow-up can refer to what was proposed.
const DISCUSSION = new Set(["answer", "proposal"]);

export function sessionMessagesFrom(chat) {
  return (chat ?? [])
    .filter((message) => message.text && (message.from === "you" || DISCUSSION.has(message.kind) || !message.kind))
    .slice(-MAX_SESSION_MESSAGES)
    .map((message) => ({ role: message.from === "ai" ? "assistant" : "user", content: message.text }));
}

// Built like the API's errors, so callers branch on `code` either way.
function outOfDate() {
  return Object.assign(new Error("This PRD changed since you opened it. Reload it, then ask again."), {
    status: 409,
    code: "stale_revision",
  });
}

// Asks for one proposal across the PRD from the chat. `revision` is the one
// the editor has: if the PRD moved on since, this refuses before using any AI
// quota. Returns { kind: "proposal", message, proposal } or, when the request
// was out of scope or unclear, { kind: "blocked" | "clarification", message }
// with nothing to compare.
export async function requestRevision(api, prdId, { revision, instruction, sessionMessages = [] }) {
  const snapshot = await api.getPrd(prdId);
  if (snapshot.revision !== revision) throw outOfDate();
  const reply = await api.requestAiRevision(prdId, { revision, instruction, sessionMessages });
  if (reply.kind !== "proposal" || !reply.proposal) return { kind: reply.kind, message: reply.message };
  return {
    kind: "proposal",
    message: reply.message,
    proposal: {
      baseRevision: reply.base_revision,
      generationRecordId: reply.generation_record_id,
      originalDocument: snapshot.content_json ?? EMPTY_DOCUMENT,
      proposedDocument: reply.proposal.content_json,
      sectionTypes: reply.proposal.section_types ?? [],
      explanation: reply.message,
      // Kept so the person can ask again after a conflict or expiry.
      instruction,
    },
  };
}

// The save that accepts a proposal: the proposed document as the server sent
// it, the revision it was made from and its record. Never title or
// description. confirmedReviewerIds only after the reviewer dialog, for an
// approved PRD (409 reapproval_required first).
export function acceptBody(proposal, confirmedReviewerIds) {
  return {
    revision: proposal.baseRevision,
    content_json: proposal.proposedDocument,
    generation_record_id: proposal.generationRecordId,
    ...(confirmedReviewerIds ? { confirmed_reviewer_ids: confirmedReviewerIds } : {}),
  };
}

// Accepts the whole proposal. Returns the saved PRD row.
export async function acceptProposal(api, prdId, proposal, { confirmedReviewerIds } = {}) {
  const body = acceptBody(proposal, confirmedReviewerIds);
  try {
    return await api.updatePrd(prdId, body);
  } catch (error) {
    // No status: the request never got an answer. It may still have been
    // saved, and the server answers the same request with that save.
    if (error?.status !== undefined) throw error;
    return api.updatePrd(prdId, body);
  }
}

export function needsReapproval(error) {
  return error?.code === "reapproval_required";
}

// The proposal can't be used any more; the person has to ask again (their
// instruction is kept for that).
const ASK_AGAIN = new Set(["stale_revision", "proposal_unavailable", "proposal_scope", "unsupported_proposal"]);

export function mustAskAgain(error) {
  return ASK_AGAIN.has(error?.code);
}

// Wording for errors from asking or accepting. Anything not listed shows the
// backend's own sentence, which is written to be shown.
export function describeProposalError(error) {
  switch (error?.code) {
    case "stale_revision":
      return "Someone saved this PRD since the proposal was made, so it can’t be applied. Ask Nautilus again for an updated proposal.";
    case "proposal_unavailable":
      return "This proposal expired or was already used. Ask Nautilus again.";
    case "proposal_scope":
    case "unsupported_proposal":
      return "This proposal no longer fits the saved PRD. Ask Nautilus again.";
    case "owner_required":
      return "This PRD is approved, so only its owners can change it.";
    case "document_not_v2":
      return "AI changes aren’t available for this PRD’s format yet.";
    case "ai_invalid_output":
    case "ai_provider_error":
      return "Nautilus couldn’t write usable changes this time. Try again.";
    default:
      return describeGenerationError(error);
  }
}
