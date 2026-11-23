// AI-suggested teams in the Share dialog (feature 08b). See
// docs/frontend-api.md, AI-recommended teams.

import { describeGenerationError } from "./aiDraft";

const people = (count) => `${count} ${count === 1 ? "person" : "people"}`;

// "adds 2 people", from new_members (only teams that would add someone are offered).
export function addsLabel(newMembers) {
  return `adds ${people(newMembers ?? 0)}`;
}

// Platform, Platform and Design, Platform, Design and Growth.
function listNames(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// "Added 3 people from Platform and Design, 1 already on it." Someone in two
// picked teams is counted once: added if either team added them.
export function suggestionResultSentence(results, teams) {
  const names = results.map((result) => teams.find((team) => team.team_id === result.team_id)?.name ?? "a team");
  const added = new Set(results.flatMap((result) => result.added.map((member) => member.user_id)));
  const skipped = new Set(
    results.flatMap((result) => result.skipped.map((member) => member.user_id)).filter((id) => !added.has(id)),
  );
  const from = listNames(names);
  if (!added.size) return `Everyone on ${from} already has access.`;
  return `Added ${people(added.size)} from ${from}${skipped.size ? `, ${skipped.size} already on it` : ""}.`;
}

// The suggestion was made from an older revision (someone saved since, maybe
// while the AI was working). It can still be accepted.
export function isSuggestionStale(baseRevision, revision) {
  return Number.isInteger(baseRevision) && Number.isInteger(revision) && baseRevision < revision;
}

// Asking for suggestions. no_eligible_teams isn't a failure: it's shown as a note.
export function describeSuggestError(error) {
  switch (error?.code) {
    case "no_eligible_teams":
      return "Everyone on your organization’s teams already has access, so there’s no team to suggest.";
    case "needs_content":
      return "Write and save some of this PRD first, so there’s something to match teams to.";
    case "stale_revision":
      return "This PRD changed since you opened it. Reload the page, then ask again.";
    case "forbidden":
      return "Only owners and admins can add teams.";
    case "ai_invalid_output":
    case "ai_provider_error":
      return "Nautilus couldn’t suggest teams this time. Try again.";
    default:
      return describeGenerationError(error);
  }
}

// Adding the picked teams. Any failure adds nobody.
export function describeDecideError(error) {
  switch (error?.code) {
    case "recommendation_unavailable":
      return "These suggestions were already used. Ask for new ones.";
    case "team_not_found":
      return "One of these teams isn’t active any more, so nobody was added. Ask for new suggestions.";
    case "team_not_recommended":
      return "That team wasn’t one of the suggestions. Ask for new ones.";
    case "forbidden":
      return "Only owners and admins can add teams.";
    default:
      return error?.message || "Couldn’t add the teams. Try again.";
  }
}
