import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { reviewerCandidates } from "../format";
import { Alert, Modal } from "../ui";
import { ReviewerPicker } from "./SubmitReviewDialog";

// Mounted only while the dialog is open. Starts from the latest round's
// reviewers, minus anyone who can't review any more.
function ReapprovalForm({ prdId, organizationId, owners, userId, busy, setBusy, onApply, onDiscard, onClose }) {
  const [candidates, setCandidates] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    Promise.all([api.getDirectory(organizationId), api.listReviews(prdId, { limit: 1 })])
      .then(([org, reviews]) => {
        if (!current) return;
        const people = reviewerCandidates(org.members, owners);
        const available = new Set(people.map((person) => person.user_id));
        const latest = reviews.items?.[0]?.reviewers ?? [];
        setCandidates(people);
        setSelected(new Set(latest.map((reviewer) => reviewer.user_id).filter((id) => available.has(id))));
      })
      .catch((cause) => {
        if (current) setLoadError(cause?.message || "Try again.");
      });
    return () => {
      current = false;
    };
    // `owners` is a new array on each render; the PRD is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prdId, organizationId, attempt]);

  async function apply() {
    setBusy(true);
    setError("");
    try {
      await onApply([...selected]);
    } catch (cause) {
      setError(cause?.message || "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const actions = (
    <>
      <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={onClose}>
        Keep editing
      </button>
      <button type="button" className="nw-btn nw-btn-danger-outline" disabled={busy} onClick={onDiscard}>
        Discard edits
      </button>
    </>
  );

  if (loadError) {
    return (
      <>
        <Alert
          onRetry={() => {
            setLoadError("");
            setAttempt((value) => value + 1);
          }}
        >
          <strong>Couldn’t load the reviewers.</strong> {loadError}
        </Alert>
        <div className="nw-modal-actions">{actions}</div>
      </>
    );
  }
  if (!candidates) {
    return (
      <p className="nw-modal-text" role="status">
        Loading reviewers…
      </p>
    );
  }

  return (
    <>
      <p className="nw-modal-text">
        This PRD is approved, so these edits make a new version that goes back to review. Confirm who should approve it.
        They’ll be notified, and earlier approvals stay with the earlier version.
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
        {actions}
        <button type="button" className="nw-btn nw-btn-primary" disabled={busy || !selected.size} onClick={apply}>
          {busy ? "Applying…" : "Apply edits"}
        </button>
      </div>
    </>
  );
}

// An owner saved edits to an approved PRD: confirm the reviewers and send the
// same save again, drop the edits, or go back to them.
export function ReapprovalDialog({ open, prdId, organizationId, owners, userId, onApply, onDiscard, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title="Your edits need new approval" busy={busy} onClose={onClose} className="ne-share-modal">
      <ReapprovalForm
        prdId={prdId}
        organizationId={organizationId}
        owners={owners}
        userId={userId}
        busy={busy}
        setBusy={setBusy}
        onApply={onApply}
        onDiscard={onDiscard}
        onClose={onClose}
      />
    </Modal>
  );
}
