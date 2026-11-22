import { useState } from "react";
import { api } from "../../../lib/api";
import { ConfirmDialog, NameDialog } from "./dialogs";
import { IconMore } from "./icons";
import { memberErrorMessage } from "./people";
import { MenuButton } from "./ui";

// The dialogs show error.message, so turn the backend's codes into the
// People page's own sentences first.
async function withReadableError(run) {
  try {
    return await run();
  } catch (cause) {
    throw new Error(memberErrorMessage(cause));
  }
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Departments (admins only): create, rename, archive and restore them. The
// database refuses a second active department with the same name
// (name_taken) and archiving one that still has active people or teams
// (department_not_empty). `onChanged` reads the directory again, so the
// Directory table and the Edit dialog's picker update straight away.
function DepartmentsSection({ organizationId, departments, members, teams, onChanged }) {
  // { kind: "create" } | { kind: "rename" | "archive", department }
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState("");

  const peopleIn = (department) => members.filter((member) => member.department_id === department.id).length;
  const teamsIn = (department) => teams.filter((team) => team.department_id === department.id && !team.archived).length;

  // Active first, then archived; each alphabetical.
  const sorted = [...departments].sort(
    (a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name),
  );

  const close = () => setDialog(null);
  // A new action replaces any earlier restore error.
  const openDialog = (next) => {
    setError("");
    setDialog(next);
  };

  async function create(name) {
    await withReadableError(() => api.createDepartment(organizationId, name));
    await onChanged();
  }

  async function rename(name) {
    await withReadableError(() => api.updateDepartment(organizationId, dialog.department.id, { name }));
    await onChanged();
  }

  async function archive() {
    await withReadableError(() => api.updateDepartment(organizationId, dialog.department.id, { archived: true }));
    await onChanged();
  }

  // Restoring has no dialog, so its error shows above the table.
  async function restore(department) {
    setError("");
    try {
      await api.updateDepartment(organizationId, department.id, { archived: false });
      await onChanged();
    } catch (cause) {
      setError(`Couldn’t restore ${department.name}. ${memberErrorMessage(cause)}`);
    }
  }

  const archiving = dialog?.kind === "archive" ? dialog.department : null;
  const archivingPeople = archiving ? peopleIn(archiving) : 0;
  const archivingTeams = archiving ? teamsIn(archiving) : 0;

  return (
    <section className="nw-section" aria-labelledby="nw-departments-h">
      <div className="nw-section-head">
        <h2 id="nw-departments-h" className="nw-h2">
          Departments
        </h2>
        <button type="button" className="nw-btn nw-btn-primary" onClick={() => openDialog({ kind: "create" })}>
          New department
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
              <th scope="col">DEPARTMENT</th>
              <th scope="col">PEOPLE</th>
              <th scope="col">TEAMS</th>
              <th scope="col">STATUS</th>
              <th scope="col">
                <span className="nw-sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((department) => (
              <tr key={department.id}>
                <td className={department.archived ? "nw-people-archived" : undefined}>{department.name}</td>
                <td>{department.archived ? "—" : count(peopleIn(department), "person", "people")}</td>
                <td>{department.archived ? "—" : count(teamsIn(department), "team", "teams")}</td>
                <td>
                  <span className={`nw-chip ${department.archived ? "nw-chip-draft" : "nw-chip-final"}`}>
                    {department.archived ? "Archived" : "Active"}
                  </span>
                </td>
                <td className="nw-row-actions">
                  <MenuButton
                    label={`Actions for ${department.name}`}
                    items={
                      department.archived
                        ? [{ label: "Restore", onSelect: () => restore(department) }]
                        : [
                            { label: "Rename", onSelect: () => openDialog({ kind: "rename", department }) },
                            {
                              label: "Archive",
                              danger: true,
                              onSelect: () => openDialog({ kind: "archive", department }),
                            },
                          ]
                    }
                  >
                    <IconMore />
                  </MenuButton>
                </td>
              </tr>
            ))}
            {sorted.length ? null : (
              <tr>
                <td colSpan={5} className="nw-table-empty">
                  No departments yet. Create one, then place people in it from the Directory.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <NameDialog
        open={dialog?.kind === "create"}
        title="New department"
        label="Department name"
        hint="It must be different from your other active departments’ names."
        submitLabel="Create department"
        busyLabel="Creating…"
        maxLength={100}
        onSubmit={create}
        onClose={close}
      />
      <NameDialog
        open={dialog?.kind === "rename"}
        title={dialog?.kind === "rename" ? `Rename ${dialog.department.name}` : "Rename department"}
        label="Department name"
        initialValue={dialog?.kind === "rename" ? dialog.department.name : ""}
        submitLabel="Save"
        maxLength={100}
        onSubmit={rename}
        onClose={close}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archiving ? `Archive ${archiving.name}?` : "Archive department?"}
        confirmLabel="Archive"
        busyLabel="Archiving…"
        onConfirm={archive}
        onClose={close}
      >
        {archivingPeople || archivingTeams ? (
          <p>
            It still has {count(archivingPeople, "person", "people")} and {count(archivingTeams, "team", "teams")}.
            Move them to another department first, or archiving will be refused.
          </p>
        ) : (
          <p>It disappears from the department pickers. You can restore it later from this list.</p>
        )}
      </ConfirmDialog>
    </section>
  );
}

export default DepartmentsSection;
