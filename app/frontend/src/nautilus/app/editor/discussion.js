// The discussion summary (feature 05): turns POST /discussion-summary into
// what the Comments panel shows. See docs/frontend-api.md, Discussion summary.

import { PRD_SECTIONS } from "../questions";
import { describeGenerationError } from "./aiDraft";

const SECTION_LABELS = Object.fromEntries(PRD_SECTIONS.map((section) => [section.id, section.label]));

// The four groups in the order they're shown. Every text field is plain text
// from the AI: React escapes it, and it is never set as HTML.
export function summaryGroups(summary) {
  const groups = [
    {
      id: "themes",
      title: "Themes",
      items: (summary?.themes ?? []).map((item) => ({ heading: item.title, text: item.summary, commentIds: item.comment_ids })),
    },
    {
      id: "questions",
      title: "Open questions",
      items: (summary?.open_questions ?? []).map((item) => ({ text: item.question, commentIds: item.comment_ids })),
    },
    {
      id: "changes",
      title: "Requested changes",
      items: (summary?.requested_changes ?? []).map((item) => ({
        heading: SECTION_LABELS[item.section_type] ?? "Whole PRD",
        text: item.change,
        commentIds: item.comment_ids,
      })),
    },
    {
      id: "unresolved",
      title: "Unresolved",
      items: (summary?.unresolved_items ?? []).map((item) => ({ text: item.item, commentIds: item.comment_ids })),
    },
  ];
  return groups.filter((group) => group.items.length);
}

// The line under the title: which version, and how much of it was read.
// Long discussions are cut to the newest comments that fit.
export function summaryScope(result) {
  const version = result.version_no ? `version ${result.version_no}` : "the current version";
  const total = result.comment_count ?? 0;
  const read = result.summarized_comment_count ?? total;
  if (read < total) return `The newest ${read} of ${total} comments on ${version}.`;
  return `${total} ${total === 1 ? "comment" : "comments"} on ${version}.`;
}

// The summary no longer matches the panel: someone saved a new version, or
// new comments arrived on the summarized one.
export function isSummaryOutdated(result, currentVersionId, comments) {
  if (!result?.version_id) return false;
  if (currentVersionId && result.version_id !== currentVersionId) return true;
  const onVersion = (comments ?? []).filter((comment) => comment.version_id === result.version_id).length;
  return onVersion > (result.comment_count ?? 0);
}

export function describeSummaryError(error) {
  switch (error?.code) {
    case "ai_invalid_output":
    case "ai_provider_error":
      return "Nautilus couldn’t summarize the discussion this time. Try again.";
    default:
      if (error?.status === 404) return "This PRD or version isn’t available any more.";
      return describeGenerationError(error);
  }
}
