import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { initialsOf, reviewerCandidates } from "../format";
import { Alert, Avatar, Modal } from "../ui";

// Checkboxes for choosing reviewers. `selected` is a Set of user ids.
export function ReviewerPicker({ candidates, selected, userId, disabled, onChange }) {
  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <ul className="ne-reviewer-list">
      {candidates.map((person) => {
        const name = person.name ?? person.email ?? "Unnamed member";
        const details = [person.title, person.name ? person.email : null].filter(Boolean).join(" · ");
        return (
          <li key={person.user_id}>
            <label className="ne-reviewer">
              <input
                type="checkbox"
                checked={selected.has(person.user_id)}
                disabled={disabled}
                onChange={() => toggle(person.user_id)}
              />
              <Avatar initials={initialsOf(person.name, person.email)} />
              <span className="ne-share-who">
                <span className="ne-share-name">
                  {name}
                  {person.user_id === userId ? " (you)" : ""}
                </span>
                {details ? <span className="ne-share-email">{details}</span> : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

// Mounted only while the dialog is open, so each opening reads the current org.
function SubmitForm({ organizationId, owners, userId, busy, setBusy, onSubmit, onClose }) {
  const [directory, setDirectory] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    api
      .getDirectory(organizationId)
      .then((org) => {
        if (current) setDirectory(org);
      })
      .catch((cause) => {
        if (current) setLoadError(cause?.message || "Try again.");
      });
    return () => {
      current = false;
    };
  }, [organizationId, attempt]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onSubmit([...selected]);
    } catch (cause) {
      setError(cause?.message || "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <>
        <Alert
          onRetry={() => {
            setLoadError("");
            setAttempt((value) => value + 1);
          }}
        >
          <strong>Couldn’t load the people in your organization.</strong> {loadError}
        </Alert>
        <div className="nw-modal-actions">
          <button type="button" className="nw-btn nw-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </>
    );
  }
  if (!directory) {
    return (
      <p className="nw-modal-text" role="status">
        Loading people…
      </p>
    );
  }

  const candidates = reviewerCandidates(directory.members, owners);

  return (
    <>
      <p className="nw-modal-text">
        The PRD is approved when every reviewer approves. One change request sends it back to you. Anyone not on this
        PRD yet can read and comment on it.
      </p>
      {error ? <Alert onDismiss={() => setError("")}>{error}</Alert> : null}
      <ReviewerPicker
        candidates={candidates}
        selected={selected}
        userId={userId}
        disabled={busy}
        onChange={setSelected}
      />
      <div className="nw-modal-actions">
        <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="nw-btn nw-btn-primary" disabled={busy || !selected.size} onClick={submit}>
          {busy ? "Submitting…" : "Submit for review"}
        </button>
      </div>
    </>
  );
}

// "Submit for review": owners and org admins send the saved version to the
// reviewers they pick.
export function SubmitReviewDialog({ open, prd, organizationId, owners, userId, onSubmit, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title={`Submit “${prd.title}” for review`} busy={busy} onClose={onClose} className="ne-share-modal">
      <SubmitForm
        organizationId={organizationId}
        owners={owners}
        userId={userId}
        busy={busy}
        setBusy={setBusy}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </Modal>
  );
}
