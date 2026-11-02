// Wording for POST /api/prds/{id}/generate and for accepting its draft.

// AI can't run here at all, so the screen offers "Start from my answers".
const UNAVAILABLE = new Set(["ai_unavailable", "ai_budget_exhausted", "ai_disabled"]);

export function isAiUnavailable(error) {
  return UNAVAILABLE.has(error?.code);
}

// The reasons worth wording ourselves; anything else shows the backend's own
// sentence, which is written to be shown as-is.
export function describeGenerationError(error) {
  const wait = Number(error?.retryAfter);
  const inAMoment = Number.isFinite(wait) && wait > 0 ? ` Try again in ${Math.ceil(wait)}s.` : "";
  switch (error?.code) {
    case "ai_cooldown":
      return `Just a moment between AI requests.${inAMoment}`;
    case "ai_busy":
      return `Nautilus is still working on another request of yours.${inAMoment}`;
    case "ai_provider_rate_limited":
      return "The AI service is at its limit right now. Try again later.";
    case "ai_provider_error":
    case "ai_invalid_output":
      return "The AI couldn’t write a usable draft this time. Try again.";
    case "intake_changed":
      return "Your interview answers changed while the draft was being written. Generate it again to use them.";
    case "intake_incomplete":
      return "The problem, target users and goals questions need answers first. Go back to your answers to finish them.";
    default:
      return error?.message || "Something went wrong. Try again.";
  }
}

// A draft can't be accepted after the PRD changes or the draft expires.
const OUT_OF_DATE = new Set(["proposal_unavailable", "stale_revision", "unsupported_proposal"]);

export function isDraftOutOfDate(error) {
  return OUT_OF_DATE.has(error?.code);
}
