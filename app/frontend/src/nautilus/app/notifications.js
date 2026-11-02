// Turns the API's notifications into what the inbox shows. Each type's payload
// is described in docs/frontend-api.md (Notifications).

import { formatDay, formatDayTime } from "./format.js";
import { PRD_SECTIONS } from "./questions.js";

const ROLE_LABELS = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

function roleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}

function sectionLabel(type) {
  return PRD_SECTIONS.find((section) => section.id === type)?.label ?? null;
}

// One notification as a sentence, in the order it's read:
// { actor } { verb } { title } { after }. Without an actor the sentence starts
// at the title. `actor_name` is null for system and AI actions.
export function notificationSentence(item) {
  const actor = item.actor_name ?? null;
  const payload = item.payload ?? {};
  const someone = (verb, after = "") => ({ actor: actor ?? "Someone", verb, after });
  const noActor = (after) => ({ actor: null, verb: "", after });

  switch (item.type) {
    case "member_added":
      return someone("added you to", ` as ${roleLabel(payload.role)}`);
    case "member_role_changed":
      return someone("changed your role on", ` from ${roleLabel(payload.from)} to ${roleLabel(payload.to)}`);
    case "comment_added":
      return someone(item.count > 1 ? `left ${item.count} comments on` : "commented on");
    case "submitted":
      return someone(payload.resubmitted ? "asked you to review again:" : "asked you to approve");
    case "approved":
      return someone("approved");
    case "changes_requested":
      return someone("requested changes on");
    case "round_approved":
      return noActor(" was approved by all reviewers");
    case "superseded":
      return noActor(payload.continued === false ? " went back to draft" : " changed, so its approval started again");
    case "work_status_changed":
      return noActor(" was marked done");
    default:
      return noActor(" was updated");
  }
}

// The icon and its colors, following the Inbox design.
export function notificationTone(type) {
  switch (type) {
    case "changes_requested":
      return "changes";
    case "submitted":
    case "superseded":
      return "attention";
    case "comment_added":
      return "comment";
    case "approved":
    case "round_approved":
      return "approved";
    default:
      return "people";
  }
}

// The small line under the sentence: the section, if it has one, then the time.
export function notificationMeta(item) {
  const section = sectionLabel(item.payload?.section_type);
  const when = formatDayTime(item.updated_at);
  return section ? `${section} · ${when}` : when;
}

// Today, Yesterday, then Earlier, keeping the API's order inside each group.
export function groupNotifications(items, now = new Date()) {
  const groups = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];
  items.forEach((item) => {
    const day = formatDay(item.updated_at, now);
    const group = day === "Today" ? groups[0] : day === "Yesterday" ? groups[1] : groups[2];
    group.items.push(item);
  });
  return groups.filter((group) => group.items.length);
}

// What an approval card says about its review round, from the PRD's `approval`.
export function approvalSummary(approval) {
  const reviewers = approval?.reviewers ?? [];
  if (!reviewers.length) return "No reviewers yet.";
  const named = (list) => list.map((reviewer) => reviewer.name ?? "A reviewer").join(", ");
  const changes = reviewers.filter((reviewer) => reviewer.state === "changes_requested");
  if (changes.length) return `${named(changes)} requested changes.`;
  const approved = reviewers.filter((reviewer) => reviewer.state === "approved").length;
  const pending = reviewers.filter((reviewer) => reviewer.state === "pending");
  if (!approved) return "No decisions yet.";
  if (!pending.length) return `${approved} of ${reviewers.length} approved.`;
  return `${approved} of ${reviewers.length} approved. Waiting on ${named(pending)}.`;
}
