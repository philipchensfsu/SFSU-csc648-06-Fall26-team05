import { useId, useState } from "react";
import { api } from "../../../lib/api";
import { memberErrorMessage, personName } from "./people";
import { Modal } from "./ui";

// The backend refuses until each decision is made, and a refusal saves
// nothing, so every retry carries the earlier choices along with the new one.
// step: "confirm", { reports: [userId] } or { prds: [{ prd_id, title }] }.
function DeactivateSteps({ member, members, organizationId, busy, setBusy, onDeactivated, onClose }) {
  const [step, setStep] = useState("confirm");
  const [choices, setChoices] = useState({});
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");
  const [stopped, setStopped] = useState(false);
  const pickId = useId();

  const name = personName(member);
  const others = members.filter((person) => person.user_id !== member.user_id);
  // Someone who reports to this person can't take over as their own manager.
  const managers = others.filter((person) => !step.reports?.includes(person.user_id));

  async function send(nextChoices) {
    setBusy(true);
    setError("");
    setChoices(nextChoices);
    try {
      await api.updateMember(organizationId, member.user_id, { active: false, ...nextChoices });
      await onDeactivated(member);
      onClose();
    } catch (cause) {
      if (cause?.code === "has_direct_reports") {
        setStep({ reports: cause.reports ?? [] });
        setPick("");
      } else if (cause?.code === "owns_prds") {
        setStep({ prds: cause.prds ?? [] });
        setPick("");
      } else {
        setError(memberErrorMessage(cause));
        setStopped(cause?.code === "last_admin");
      }
    } finally {
      setBusy(false);
    }
  }

  function confirm() {
    if (step.reports) send({ ...choices, replacement_manager_id: pick || null });
    else if (step.prds) send({ ...choices, transfer_owner_to: pick });
    else send(choices);
  }

  return (
    <>
      {step === "confirm" ? (
        <p className="nw-modal-text">
          {name} will lose access to every PRD right away, and their department head and team lead positions will be
          cleared.
        </p>
      ) : null}

      {step.reports ? (
        <div className="nw-field">
          <p className="nw-modal-text">{name} manages people. Who should they report to now?</p>
          <ul className="nw-people-list">
            {step.reports.map((id) => (
              <li key={id}>{personName(members.find((person) => person.user_id === id))}</li>
            ))}
          </ul>
          <label htmlFor={pickId} className="nw-label">
            New manager
          </label>
          <select
            id={pickId}
            className="nw-select nw-people-pick"
            value={pick}
            disabled={busy}
            onChange={(event) => setPick(event.target.value)}
          >
            <option value="">No manager</option>
            {managers.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {personName(person)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {step.prds ? (
        <div className="nw-field">
          <p className="nw-modal-text">{name} is the only owner of these PRDs. Who should take them over?</p>
          <ul className="nw-people-list">
            {step.prds.map((prd) => (
              <li key={prd.prd_id}>{prd.title}</li>
            ))}
          </ul>
          <label htmlFor={pickId} className="nw-label">
            New owner
          </label>
          <select
            id={pickId}
            className="nw-select nw-people-pick"
            value={pick}
            disabled={busy}
            onChange={(event) => setPick(event.target.value)}
          >
            <option value="">Choose a person…</option>
            {others.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {personName(person)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="nw-modal-actions">
        <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={onClose}>
          {stopped ? "Close" : "Cancel"}
        </button>
        {stopped ? null : (
          <button
            type="button"
            className="nw-btn nw-btn-danger"
            disabled={busy || (step.prds && !pick)}
            onClick={confirm}
          >
            {busy ? "Deactivating…" : "Deactivate"}
          </button>
        )}
      </div>
    </>
  );
}

// Deactivating someone: the confirmation, then any choices the backend asks
// for. `members` is the active directory.
function DeactivateDialog({ member, members, organizationId, onDeactivated, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open title={`Deactivate ${personName(member)}?`} busy={busy} onClose={onClose}>
      <DeactivateSteps
        member={member}
        members={members}
        organizationId={organizationId}
        busy={busy}
        setBusy={setBusy}
        onDeactivated={onDeactivated}
        onClose={onClose}
      />
    </Modal>
  );
}

export default DeactivateDialog;
