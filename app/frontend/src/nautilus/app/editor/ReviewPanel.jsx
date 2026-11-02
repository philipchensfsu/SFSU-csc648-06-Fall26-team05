import { forwardRef, useId, useState } from "react";
import { approvalProgress, formatDayTime, initialsOf } from "../format";
import { Avatar } from "../ui";

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

// Where the current round stands, and what each reviewer said.
export function ApprovalsCard({ approval, userId }) {
  const ids = useId();
  if (!approval?.required_count) return null;
  return (
    <section className="ne-card" aria-labelledby={`${ids}-title`}>
      <div className="ne-card-head">
        <h2 id={`${ids}-title`} className="ne-card-title">
          Approvals
        </h2>
        <span className="ne-card-note">{approvalProgress(approval)}</span>
      </div>
      <ul className="ne-approvals">
        {(approval.reviewers ?? []).map((reviewer) => {
          const state = REVIEWER_STATES[reviewer.state] ?? REVIEWER_STATES.pending;
          const name = reviewer.user_id === userId ? "You" : (reviewer.name ?? "Unnamed member");
          const details = [reviewer.department, reviewer.decided_at ? formatDayTime(reviewer.decided_at) : null]
            .filter(Boolean)
            .join(" · ");
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
