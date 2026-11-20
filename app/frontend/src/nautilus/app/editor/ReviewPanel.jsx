import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { api } from "../../../../lib/api";
import { approvalProgress, formatDayTime, initialsOf, reviewerCandidates } from "../format";
import { Alert, Avatar, Modal } from "../ui";
import { ReviewerPicker } from "./SubmitReviewDialog";

const EXPLANATION_MAX = 5000;

const REVIEWER_STATES = {
  pending: { tone: "draft", label: "Waiting" },
  approved: { tone: "approved", label: "Approved" },
  changes_requested: { tone: "changes_requested", label: "Changes requested" },
};

// A reviewer decides once per round. `choice` is "approved",
// "changes_requested" or null; the header's buttons can set it too.
export const YourReviewCard = forwardRef(function YourReviewCard({ choice, blocked, onChoose, onDecide }, ref) {
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = useId();

  const requesting = choice === "changes_requested";
  const text = explanation.trim();

  async function send() {
    setBusy(true);
    setError("");
    try {
      await onDecide({ decision: choice, explanation: text });
    } catch (cause) {
      setError(cause?.message || "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section ref={ref} className="ne-card ne-your-review" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="ne-card-title">
        Your review
      </h2>
      <div className="ne-review-choice" role="group" aria-label="Your decision">
        <button
          type="button"
          className={`nw-btn nw-btn-sm ${choice === "approved" ? "nw-btn-primary" : "nw-btn-secondary"}`}
          aria-pressed={choice === "approved"}
          disabled={busy}
          onClick={() => onChoose("approved")}
        >
          Approve
        </button>
        <button
          type="button"
          className={`nw-btn nw-btn-sm ${requesting ? "nw-btn-primary" : "nw-btn-secondary"}`}
          aria-pressed={requesting}
          disabled={busy}
          onClick={() => onChoose("changes_requested")}
        >
          Request changes
        </button>
      </div>
      {choice ? (
        <>
          <label className="ne-review-label" htmlFor={`${ids}-text`}>
            {requesting ? "What needs to change (required)" : "Add a note (optional)"}
          </label>
          <textarea
            id={`${ids}-text`}
            className="nf-textarea ne-review-text"
            rows={4}
            maxLength={EXPLANATION_MAX}
            value={explanation}
            disabled={busy}
            onChange={(event) => setExplanation(event.target.value)}
          />
          {blocked ? (
            <p className="ne-card-note">
              You have unsaved edits. Save or discard them first, because this review covers the last saved version.
            </p>
          ) : (
            <p className="ne-card-note">The owners are notified. You can’t change your decision on this version.</p>
          )}
          {error ? (
            <p className="nw-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="nw-btn nw-btn-primary nw-btn-sm"
            disabled={busy || blocked || (requesting && !text)}
            onClick={send}
          >
            {busy ? "Sending…" : requesting ? "Send change request" : "Approve this version"}
          </button>
        </>
      ) : null}
    </section>
  );
});

// Reviewers change only on an open round, and only those who haven't decided.
const OPEN_ROUND_STATES = new Set(["in_review", "changes_requested"]);

function ReplaceForm({ reviewer, reviewers, organizationId, owners, userId, busy, onReplace, onClose }) {
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

  async function replace() {
    setError("");
    try {
      await onReplace([...selected][0]);
    } catch (cause) {
      setError(cause?.message || "That didn’t work. Try again.");
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

  // Anyone already on the round can't be added again.
  const onRound = new Set(reviewers.map((person) => person.user_id));
  const candidates = reviewerCandidates(directory.members ?? [], owners).filter(
    (person) => !onRound.has(person.user_id),
  );

  return (
    <>
      <p className="nw-modal-text">
        {reviewer.name ?? "This reviewer"} is taken off this round and notified. The person you pick starts as a pending
        reviewer and can read and comment on the PRD.
      </p>
      {error ? <Alert onDismiss={() => setError("")}>{error}</Alert> : null}
      {candidates.length ? (
        <ReviewerPicker
          candidates={candidates}
          selected={selected}
          userId={userId}
          disabled={busy}
          single
          onChange={setSelected}
        />
      ) : (
        <p className="nw-modal-text">Everyone else in your organization is already a reviewer on this round.</p>
      )}
      <div className="nw-modal-actions">
        <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="nw-btn nw-btn-primary" disabled={busy || !selected.size} onClick={replace}>
          {busy ? "Replacing…" : "Replace reviewer"}
        </button>
      </div>
    </>
  );
}

// Where the current round stands, and what each reviewer said.
// With `manage` ({ organizationId, owners, onReplace(userId, newId),
// onRemove(userId) }), owners and org admins can replace or remove a reviewer
// who hasn't decided yet while the round is open.
export function ApprovalsCard({ approval, userId, manage = null }) {
  const ids = useId();
  // The reviewer whose replace or remove is out; one at a time.
  const [busyId, setBusyId] = useState(null);
  const inFlight = useRef(false);
  const [confirming, setConfirming] = useState(null);
  const [replacing, setReplacing] = useState(null);
  const [error, setError] = useState("");

  if (!approval?.required_count) return null;
  const reviewers = approval.reviewers ?? [];
  const canManage = Boolean(manage) && OPEN_ROUND_STATES.has(approval.state);
  // A round keeps at least one reviewer; the last one can only be replaced.
  const canRemove = reviewers.length > 1;

  // The ref also stops a second click that lands before the re-render.
  async function run(reviewerId, action) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusyId(reviewerId);
    setError("");
    try {
      await action();
      return true;
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  }

  async function remove(reviewer) {
    try {
      const done = await run(reviewer.user_id, () => manage.onRemove(reviewer.user_id));
      if (done) setConfirming(null);
    } catch (cause) {
      setError(cause?.message || "That didn’t work. Try again.");
    }
  }

  // Errors stay in the dialog, which shows them next to the choice.
  async function replace(newId) {
    const reviewer = replacing;
    const done = await run(reviewer.user_id, () => manage.onReplace(reviewer.user_id, newId));
    if (done) setReplacing(null);
  }

  return (
    <section className="ne-card" aria-labelledby={`${ids}-title`}>
      <div className="ne-card-head">
        <h2 id={`${ids}-title`} className="ne-card-title">
          Approvals
        </h2>
        <span className="ne-card-note">{approvalProgress(approval)}</span>
      </div>
      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="ne-approvals">
        {reviewers.map((reviewer) => {
          const state = REVIEWER_STATES[reviewer.state] ?? REVIEWER_STATES.pending;
          const name = reviewer.user_id === userId ? "You" : (reviewer.name ?? "Unnamed member");
          const details = [reviewer.department, reviewer.decided_at ? formatDayTime(reviewer.decided_at) : null]
            .filter(Boolean)
            .join(" · ");
          const manageable = canManage && reviewer.state === "pending";
          const busy = busyId !== null;
          const label = reviewer.name ?? "this reviewer";
          return (
            <li key={reviewer.user_id} className="ne-approval">
              <div className="ne-approval-head">
                <Avatar initials={initialsOf(reviewer.name, null)} />
                <span className="ne-share-who">
                  <span className="ne-share-name">{name}</span>
                  {details ? <span className="ne-share-email">{details}</span> : null}
                </span>
                <span className={`nw-chip nw-chip-${state.tone}`}>
                  <span className="nw-chip-dot" aria-hidden="true" />
                  {state.label}
                </span>
              </div>
              {reviewer.explanation ? <p className="ne-approval-note">{reviewer.explanation}</p> : null}
              {manageable && confirming === reviewer.user_id ? (
                <div className="ne-approval-actions" role="group" aria-label={`Remove ${label}?`}>
                  <span className="ne-card-note">Remove {label} from this round? They’re notified.</span>
                  <button
                    type="button"
                    className="nw-btn nw-btn-danger nw-btn-sm"
                    disabled={busy}
                    onClick={() => remove(reviewer)}
                  >
                    {busyId === reviewer.user_id ? "Removing…" : "Remove"}
                  </button>
                  <button
                    type="button"
                    className="nw-btn nw-btn-secondary nw-btn-sm"
                    disabled={busy}
                    onClick={() => setConfirming(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : manageable ? (
                <div className="ne-approval-actions">
                  <button
                    type="button"
                    className="nw-btn nw-btn-secondary nw-btn-sm"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setConfirming(null);
                      setReplacing(reviewer);
                    }}
                  >
                    Replace<span className="nw-sr"> {label}</span>
                  </button>
                  {canRemove ? (
                    <button
                      type="button"
                      className="nw-btn nw-btn-danger-outline nw-btn-sm"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setConfirming(reviewer.user_id);
                      }}
                    >
                      Remove<span className="nw-sr"> {label}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {manage ? (
        <Modal
          open={Boolean(replacing) && canManage}
          title={`Replace ${replacing?.name ?? "reviewer"}`}
          busy={busyId !== null}
          onClose={() => setReplacing(null)}
          className="ne-share-modal"
        >
          {replacing ? (
            <ReplaceForm
              reviewer={replacing}
              reviewers={reviewers}
              organizationId={manage.organizationId}
              owners={manage.owners ?? []}
              userId={userId}
              busy={busyId !== null}
              onReplace={replace}
              onClose={() => setReplacing(null)}
            />
          ) : null}
        </Modal>
      ) : null}
    </section>
  );
}
