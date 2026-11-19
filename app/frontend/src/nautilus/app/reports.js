// Turns GET /api/reports/progress into what the Reports page shows. The
// response is described in docs/frontend-api.md (Reports, feature 10).
// Pure functions only, so they can be tested without the API.

import { PRIORITIES, WORK_STATUSES } from "./details/details.js";
import { STATUS_ORDER, statusLabel } from "./format.js";

// How many activity events the page asks for (the API allows 1–50).
export const REPORT_ACTIVITY_LIMIT = 20;

const PRIORITY_ROWS = [...PRIORITIES, { id: "none", label: "No priority" }];

// The API lists only values that occur, so a missing key is 0. Known values
// come first in their usual order, then any the page doesn't know yet.
function countRows(counts, known, labelOf = (id) => id) {
  const values = counts ?? {};
  const rows = known.map(({ id, label }) => ({ id, label, count: values[id] ?? 0 }));
  const extra = Object.keys(values)
    .filter((id) => !known.some((entry) => entry.id === id))
    .map((id) => ({ id, label: labelOf(id), count: values[id] ?? 0 }));
  return [...rows, ...extra];
}

export function statusRows(counts) {
  return countRows(
    counts,
    STATUS_ORDER.map((id) => ({ id, label: statusLabel(id) })),
    statusLabel,
  );
}

export function workStatusRows(counts) {
  return countRows(counts, WORK_STATUSES);
}

export function priorityRows(counts) {
  return countRows(counts, PRIORITY_ROWS);
}

export function ownerLabel(owner) {
  return owner?.name ?? "Unnamed member";
}

// `team: null` is the row for PRDs without an owning team.
export function teamLabel(team) {
  if (!team) return "No team";
  return team.name ?? "Unnamed team";
}

// One status count for an owner or team row, 0 when it's missing.
export function countOf(counts, id) {
  return counts?.[id] ?? 0;
}

// The filters as the API call takes them; "" means "all".
export function reportQuery(filters) {
  return {
    teamId: filters.teamId || undefined,
    projectId: filters.projectId || undefined,
    ownerId: filters.ownerId || undefined,
    activityLimit: REPORT_ACTIVITY_LIMIT,
  };
}

export function hasFilters(filters) {
  return Boolean(filters.teamId || filters.projectId || filters.ownerId);
}

// Filter choices from the org directory: active teams, then members, by name.
export function teamChoices(teams) {
  return (teams ?? [])
    .filter((team) => !team.archived)
    .map((team) => ({ id: team.id, label: team.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function ownerChoices(members) {
  return (members ?? [])
    .map((member) => ({ id: member.user_id, label: member.name || member.email || "Unnamed member" }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function projectChoices(projects) {
  return [...(projects ?? [])]
    .map((project) => ({ id: project.id, label: project.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
