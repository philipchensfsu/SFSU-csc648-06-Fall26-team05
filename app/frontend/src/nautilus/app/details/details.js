// Wording and small rules for the PRD details page and its history.
// Pure functions only, so they can be tested without the API.

import { PRD_SECTIONS } from "../questions.js";

const SECTION_LABELS = Object.fromEntries(PRD_SECTIONS.map((section) => [section.id, section.label]));

// "Goals, Success metrics" style labels for a version's changed_sections.
export function sectionLabel(type) {
  return SECTION_LABELS[type] ?? type;
}

// The tag a version shows next to who saved it. A plain edit shows none.
export function originLabel(origin) {
  if (origin === "ai_generated") return "AI suggestion accepted";
  if (origin === "checkpoint") return "Saved before history";
  return "";
}

// Who saved a version. The actor is null for the checkpoint that kept
// content saved before history existed, and when the account was deleted.
export function versionAuthor(version) {
  if (version?.actor?.name) return version.actor.name;
  if (version?.origin === "checkpoint") return "Nautilus";
  return "Former member";
}

// Everyone who saved one of the loaded versions, most saves first, then by
// name. People without an account any more aren't listed.
export function contributors(versions) {
  const byId = new Map();
  for (const version of versions ?? []) {
    const actor = version?.actor;
    if (!actor?.id) continue;
    const known = byId.get(actor.id);
    if (known) known.count += 1;
    else byId.set(actor.id, { id: actor.id, name: actor.name ?? "Unnamed member", count: 1 });
  }
  return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Work status (E14): the three states, and the moves the backend allows.
export const WORK_STATUSES = [
  { id: "not_started", label: "Not started" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
];

const NEXT_WORK_STATUS = {
  not_started: ["in_progress"],
  in_progress: ["done"],
  done: ["in_progress"],
};

export function canMoveWorkStatus(from, to) {
  return (NEXT_WORK_STATUS[from ?? "not_started"] ?? []).includes(to);
}

export function workStatusLabel(status) {
  return WORK_STATUSES.find((item) => item.id === status)?.label ?? "Not started";
}

export const PRIORITIES = [
  { id: "critical", label: "Critical" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

export function priorityLabel(priority) {
  return PRIORITIES.find((item) => item.id === priority)?.label ?? "Not set";
}

// Teams a PRD can belong to: the org's active teams, by name. An archived
// team that's still set on the PRD stays in the list so it shows.
export function teamOptions(teams, currentId) {
  return (teams ?? [])
    .filter((team) => !team.archived || team.id === currentId)
    .map((team) => ({ id: team.id, label: team.archived ? `${team.name} (archived)` : team.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function teamName(teams, id) {
  if (!id) return "No team";
  return (teams ?? []).find((team) => team.id === id)?.name ?? "A team you can’t see";
}

const ROLE_ORDER = { owner: 0, editor: 1, viewer: 2 };
const ROLE_LABEL = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

export function roleLabel(role) {
  return ROLE_LABEL[role] ?? role;
}

// Owners first, then editors, then viewers, each by name.
export function sortMembers(members) {
  return [...(members ?? [])].sort(
    (a, b) =>
      (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || (a.name ?? "").localeCompare(b.name ?? ""),
  );
}
