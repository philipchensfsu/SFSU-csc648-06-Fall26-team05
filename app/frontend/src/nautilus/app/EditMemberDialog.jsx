import { useId, useState } from "react";
import { api } from "../../../lib/api";
import { memberChanges, memberErrorMessage, personName } from "./people";
import { Modal } from "./ui";

// Mounted only while the dialog is open, so each opening starts from the
// person's current values.
function EditMemberForm({ member, organizationId, departments, members, busy, setBusy, onSaved, onClose }) {
  const [form, setForm] = useState({
    accessRole: member.access_role,
    departmentId: member.department_id ?? "",
    managerId: member.manager_id ?? "",
    title: member.title ?? "",
  });
  const [error, setError] = useState("");
  const ids = useId();

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const managers = members.filter((person) => person.user_id !== member.user_id);

  async function handleSubmit(event) {
    event.preventDefault();
    const changes = memberChanges(member, form);
    if (!Object.keys(changes).length) {
      onClose();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.updateMember(organizationId, member.user_id, changes);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(memberErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="nw-field">
        <label htmlFor={`${ids}-role`} className="nw-label">
          Org role
        </label>
        <select id={`${ids}-role`} className="nw-select nw-people-pick" value={form.accessRole} onChange={set("accessRole")}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div className="nw-field">
        <label htmlFor={`${ids}-department`} className="nw-label">
          Department
        </label>
        <select
          id={`${ids}-department`}
          className="nw-select nw-people-pick"
          value={form.departmentId}
          onChange={set("departmentId")}
        >
          <option value="">No department</option>
          {departments
            .filter((department) => !department.archived)
            .map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
        </select>
      </div>
      <div className="nw-field">
        <label htmlFor={`${ids}-manager`} className="nw-label">
          Manager
        </label>
        <select
          id={`${ids}-manager`}
          className="nw-select nw-people-pick"
          value={form.managerId}
          onChange={set("managerId")}
        >
          <option value="">No manager</option>
          {managers.map((person) => (
            <option key={person.user_id} value={person.user_id}>
              {personName(person)}
            </option>
          ))}
        </select>
      </div>
      <div className="nw-field">
        <label htmlFor={`${ids}-title`} className="nw-label">
          Title
        </label>
        <input
          id={`${ids}-title`}
          className="nw-input"
          value={form.title}
          maxLength={100}
          autoComplete="off"
          onChange={set("title")}
        />
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
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// Changes someone's org role, department, manager and title.
function EditMemberDialog({ member, organizationId, departments, members, onSaved, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open title={`Edit ${personName(member)}`} busy={busy} onClose={onClose}>
      <EditMemberForm
        member={member}
        organizationId={organizationId}
        departments={departments}
        members={members}
        busy={busy}
        setBusy={setBusy}
        onSaved={onSaved}
        onClose={onClose}
      />
    </Modal>
  );
}

export default EditMemberDialog;
