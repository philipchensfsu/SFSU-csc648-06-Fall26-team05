import { useId, useState } from "react";
import { api } from "../../../lib/api";
import { ConfirmDialog } from "./dialogs";
import { IconMore } from "./icons";
import { count, memberErrorMessage, withReadableError } from "./people";
import { MenuButton, Modal } from "./ui";

// Name and department for a new team, or for changing one. Only rendered
// while the dialog is open, so each opening starts from `team`.
function TeamForm({ team, departments, submitLabel, busyLabel, busy, setBusy, onSubmit, onClose }) {
  const [name, setName] = useState(team?.name ?? "");
  const [departmentId, setDepartmentId] = useState(team?.department_id ?? "");
  const [error, setError] = useState("");
  const ids = useId();

  // Active departments, plus the team's current one if it was archived since,
  // so the picker still shows where the team is.
  const choices = departments.filter((department) => !department.archived || department.id === team?.department_id);

  function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Team name is required.");
      return;
    }
    const changes = {};
    if (trimmed !== (team?.name ?? "")) changes.name = trimmed;
    if ((departmentId || null) !== (team?.department_id ?? null)) changes.department_id = departmentId || null;
    if (team && !Object.keys(changes).length) {
      onClose();
      return;
    }
    setBusy(true);
    setError("");
    Promise.resolve(onSubmit(team ? changes : { name: trimmed, departmentId: departmentId || null }))
      .then(() => {
        setBusy(false);
        onClose();
      })
      .catch((reason) => {
        setBusy(false);
        setError(reason?.message || "That didn’t work. Try again.");
      });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="nw-field">
        <label htmlFor={`${ids}-name`} className="nw-label">
          Team name
        </label>
        <input
          id={`${ids}-name`}
          className="nw-input"
          value={name}
          maxLength={100}
          autoComplete="off"
          data-autofocus
          disabled={busy}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError("");
          }}
        />
      </div>
      <div className="nw-field">
        <label htmlFor={`${ids}-department`} className="nw-label">
          Department
        </label>
        <select
          id={`${ids}-department`}
          className="nw-select nw-people-pick"
          value={departmentId}
          disabled={busy}
          onChange={(event) => setDepartmentId(event.target.value)}
        >
          <option value="">No department</option>
          {choices.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="nw-modal-actions">
        <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="nw-btn nw-btn-primary" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

function TeamDialog({ open, title, ...props }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title={title} busy={busy} onClose={props.onClose}>
      <TeamForm {...props} busy={busy} setBusy={setBusy} />
    </Modal>
  );
}

// Teams (admins only): create them, rename or move them between departments,
// archive and restore. People join teams from the Edit member dialog. The
// database refuses a second active team with the same name (name_taken) and
// archiving one that still has active people (team_not_empty).
function TeamsSection({ organizationId, departments, members, teams, onChanged }) {
  // { kind: "create" } | { kind: "edit" | "archive", team }
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState("");

  const peopleOn = (team) => members.filter((member) => member.team_ids?.includes(team.id)).length;
  const departmentOf = (team) => departments.find((department) => department.id === team.department_id);

  const sorted = [...teams].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));

  const close = () => setDialog(null);
  const openDialog = (next) => {
    setError("");
    setDialog(next);
  };

  async function create({ name, departmentId }) {
    await withReadableError(() => api.createTeam(organizationId, name, departmentId));
    await onChanged();
  }

  async function edit(changes) {
    await withReadableError(() => api.updateTeam(organizationId, dialog.team.id, changes));
    await onChanged();
  }

  async function archive() {
    await withReadableError(() => api.updateTeam(organizationId, dialog.team.id, { archived: true }));
    await onChanged();
  }

  // An archived department can't hold an active team, so restoring a team
  // whose department was archived since is refused. Say so up front rather
  // than letting the database's department_not_empty message through, which
  // is about archiving a department and makes no sense here.
  async function restore(team) {
    setError("");
    const department = departmentOf(team);
    if (department?.archived) {
      setError(`${team.name} is in ${department.name}, which is archived. Restore ${department.name} first.`);
      return;
    }
    try {
      await api.updateTeam(organizationId, team.id, { archived: false });
      await onChanged();
    } catch (cause) {
      // The same case when this page's directory was out of date.
      const reason =
        cause?.code === "department_not_empty"
          ? "Its department is archived. Restore the department first."
          : memberErrorMessage(cause);
      setError(`Couldn’t restore ${team.name}. ${reason}`);
    }
  }

  const archiving = dialog?.kind === "archive" ? dialog.team : null;
  const archivingPeople = archiving ? peopleOn(archiving) : 0;

  return (
    <section className="nw-section" aria-labelledby="nw-teams-h">
      <div className="nw-section-head">
        <h2 id="nw-teams-h" className="nw-h2">
          Teams
        </h2>
        <button type="button" className="nw-btn nw-btn-primary" onClick={() => openDialog({ kind: "create" })}>
          New team
        </button>
      </div>

      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="nw-table-card">
        <table className="nw-table nw-people-table">
          <thead>
            <tr>
              <th scope="col">TEAM</th>
              <th scope="col">DEPARTMENT</th>
              <th scope="col">PEOPLE</th>
              <th scope="col">STATUS</th>
              <th scope="col">
                <span className="nw-sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team) => {
              const department = departmentOf(team);
              return (
                <tr key={team.id}>
                  <td className={team.archived ? "nw-people-archived" : undefined}>{team.name}</td>
                  <td>
                    {department ? (
                      <span className={department.archived ? "nw-people-archived" : undefined}>{department.name}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{team.archived ? "—" : count(peopleOn(team), "person", "people")}</td>
                  <td>
                    <span className={`nw-chip ${team.archived ? "nw-chip-draft" : "nw-chip-final"}`}>
                      {team.archived ? "Archived" : "Active"}
                    </span>
                  </td>
                  <td className="nw-row-actions">
                    <MenuButton
                      label={`Actions for team ${team.name}`}
                      items={
                        team.archived
                          ? [{ label: "Restore", onSelect: () => restore(team) }]
                          : [
                              { label: "Edit", onSelect: () => openDialog({ kind: "edit", team }) },
                              { label: "Archive", danger: true, onSelect: () => openDialog({ kind: "archive", team }) },
                            ]
                      }
                    >
                      <IconMore />
                    </MenuButton>
                  </td>
                </tr>
              );
            })}
            {sorted.length ? null : (
              <tr>
                <td colSpan={5} className="nw-table-empty">
                  No teams yet. Create one, then add people to it from the Directory’s Edit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <TeamDialog
        open={dialog?.kind === "create"}
        title="New team"
        departments={departments}
        submitLabel="Create team"
        busyLabel="Creating…"
        onSubmit={create}
        onClose={close}
      />
      <TeamDialog
        open={dialog?.kind === "edit"}
        title={dialog?.kind === "edit" ? `Edit ${dialog.team.name}` : "Edit team"}
        team={dialog?.kind === "edit" ? dialog.team : null}
        departments={departments}
        submitLabel="Save"
        busyLabel="Saving…"
        onSubmit={edit}
        onClose={close}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archiving ? `Archive ${archiving.name}?` : "Archive team?"}
        confirmLabel="Archive"
        busyLabel="Archiving…"
        onConfirm={archive}
        onClose={close}
      >
        {archivingPeople ? (
          <p>
            It still has {count(archivingPeople, "person", "people")}. Take them off the team first (Edit in the
            Directory), or archiving will be refused.
          </p>
        ) : (
          <p>It disappears from the team pickers. You can restore it later from this list.</p>
        )}
      </ConfirmDialog>
    </section>
  );
}

export default TeamsSection;
