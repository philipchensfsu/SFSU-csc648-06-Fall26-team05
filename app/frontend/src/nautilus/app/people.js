// The reasons an admin can act on; anything else shows the backend's own
// sentence, which is written to be shown as-is.
const MEMBER_ERRORS = {
  last_admin: "Make someone else an admin first. An organization needs at least one.",
  manager_cycle: "That would make a reporting loop. Choose a different manager.",
  manager_inactive: "That manager isn’t an active member.",
  head_not_in_department: "Move this person’s head role first, or add them to the department.",
  lead_not_in_team: "Change or clear the team lead first.",
  name_taken: "That name is already in use.",
  department_not_empty: "Move its people and teams out before archiving it.",
  team_not_empty: "Move its people out before archiving it.",
  team_archived: "This team is archived, so it can’t take new members.",
  forbidden: "Only admins can do this.",
};

export function memberErrorMessage(error) {
  return MEMBER_ERRORS[error?.code] ?? (error?.message || "That didn’t work. Try again.");
}

// Names and emails can both be missing, so everything shows this.
export function personName(member) {
  return member?.name || member?.email || "Unnamed member";
}

// What to send: only the fields the form changed, with null clearing one.
export function memberChanges(member, form) {
  const next = {
    access_role: form.accessRole,
    department_id: form.departmentId || null,
    manager_id: form.managerId || null,
    title: form.title.trim() || null,
  };
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== (member[key] ?? null)));
}
