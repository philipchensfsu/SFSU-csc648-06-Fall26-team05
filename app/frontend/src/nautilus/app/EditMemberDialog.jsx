
import { useId, useState } from "react";
import { api } from "../../../lib/api";
import { memberChanges, memberErrorMessage, personName } from "./people";
import { Modal } from "./ui";

// Mounted only while the dialog is open, so each opening starts from the
// person's current values.
function EditMemberForm({
  member,
  organizationId,
  departments,
  members,
  userId,
  recheckOrganization,
  busy,
  setBusy,
  onSaved,
  onClose,
}) {
  const [form, setForm] = useState({
    accessRole: member.access_role,
    departmentId: member.department_id ?? "",
    managerId: member.manager_id ?? "",
    title: member.title ?? "",
  });
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const ids = useId();

  const set = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
    setConfirming(false);
  };

  const managers = members.filter(
    (person) => person.user_id !== member.user_id,
  );

  const isSelfDemotion =
    member.user_id === userId &&
    member.access_role === "admin" &&
    form.accessRole === "member";

  async function saveChanges() {
    const changes = memberChanges(member, form);

    setBusy(true);
    setError("");

    try {
      await api.updateMember(
        organizationId,
        member.user_id,
        changes,
      );

      // Refresh permissions immediately after changing your own role.
      if (isSelfDemotion) {
        recheckOrganization?.();
      } else {
        await onSaved();
        onClose();
      }
    } catch (cause) {
      setError(memberErrorMessage(cause));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (busy) return;

    const changes = memberChanges(member, form);

    if (!Object.keys(changes).length) {
      onClose();
      return;
    }

    // An admin must explicitly confirm lowering their own role.
    if (isSelfDemotion && !confirming) {
      setConfirming(true);
      setError("");
      return;
    }

    await saveChanges();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="nw-field">
        <label htmlFor={`${ids}-role`} className="nw-label">
          Org role
        </label>
        <select
          id={`${ids}-role`}
          className="nw-select nw-people-pick"
          value={form.accessRole}
          disabled={busy}
          onChange={set("accessRole")}
        >
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
          disabled={busy}
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
          disabled={busy}
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
          disabled={busy}
          onChange={set("title")}
        />
      </div>

      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : null}

      {confirming && isSelfDemotion ? (
        <div className="nw-modal-text" role="alert">
          <p>
            This changes your own access, and you may not be able
            to undo it. Another admin will need to restore your
            admin role.
          </p>

          <div className="nw-modal-actions">
            <button
              type="button"
              className="nw-btn nw-btn-secondary"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="nw-btn nw-btn-danger"
              disabled={busy}
            >
              {busy ? "Saving…" : "Yes, change it"}
            </button>
          </div>
        </div>
      ) : (
        <div className="nw-modal-actions">
          <button
            type="button"
            className="nw-btn nw-btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="nw-btn nw-btn-primary"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </form>
  );
}

// Changes someone's org role, department, manager and title.
function EditMemberDialog({
  member,
  organizationId,
  departments,
  members,
  userId,
  recheckOrganization,
  onSaved,
  onClose,
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      title={`Edit ${personName(member)}`}
      busy={busy}
      onClose={onClose}
    >
      <EditMemberForm
        member={member}
        organizationId={organizationId}
        departments={departments}
        members={members}
        userId={userId}
        recheckOrganization={recheckOrganization}
        busy={busy}
        setBusy={setBusy}
        onSaved={onSaved}
        onClose={onClose}
      />
    </Modal>
  );
}

export default EditMemberDialog;
