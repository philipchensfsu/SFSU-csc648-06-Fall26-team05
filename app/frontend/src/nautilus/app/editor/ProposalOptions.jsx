import { useId, useState } from "react";
import "./comparison.css";
import { ChangedSections } from "./PrdProposalComparison";
import { SECTION_TYPES } from "./schema";

const SECTION_LABELS = Object.fromEntries(SECTION_TYPES);

// Feature 09: two ways to address the same review comments, from one AI
// request. The person reads each option's approach and trade-offs, opens one
// to see the sections it changes, then applies it, asks for adjustments, or
// asks again. Everything the AI wrote is shown as text, never HTML.
//
// Props:
//   options        the proposals (editor/proposal.js requestFeedbackAlternatives),
//                  each with `option`, `title`, `explanation`, `tradeoffs`,
//                  `sectionTypes`, `originalDocument` and `proposedDocument`
//   selected       the `option` number that is open
//   onSelect(n)    opens another option
//   onAccept       saves the open option. The editor handles its errors
//   onAdjust(instruction)  asks for changes to the open option. Resolves once
//                  the adjusted proposal is in (the editor then shows it on its
//                  own: the options can't be used after that); rejects with an
//                  Error whose message is shown, keeping what was typed
//   onAskAgain()   asks for a new pair for the same comments. Rejects with an
//                  Error whose message is shown
//   onDiscard
//   busy, adjusting  while applying or adjusting: every action waits
//   inReview       the PRD is in review, so applying starts the review again
//   notice         an Alert to show above the options (errors, conflicts)
export default function ProposalOptions({
  options,
  selected,
  onSelect,
  onAccept,
  onAdjust,
  onAskAgain,
  onDiscard,
  busy = false,
  adjusting = false,
  inReview = false,
  notice = null,
}) {
  const id = useId();
  const [asking, setAsking] = useState(false);
  const [request, setRequest] = useState("");
  const [adjustError, setAdjustError] = useState("");
  const [askingAgain, setAskingAgain] = useState(false);
  const [againError, setAgainError] = useState("");
  const waiting = busy || adjusting || askingAgain;
  const commentCount = options[0]?.feedbackIds?.length ?? 0;
  const note = options[0]?.instruction;

  function open(option) {
    if (waiting || option === selected) return;
    setAsking(false);
    setAdjustError("");
    onSelect(option);
  }

  async function adjust(event) {
    event.preventDefault();
    const typed = request.trim();
    if (!typed || waiting) return;
    setAdjustError("");
    try {
      await onAdjust(typed);
    } catch (error) {
      setAdjustError(error?.message || "Couldn’t adjust this option. Try again.");
    }
  }

  async function askAgain() {
    if (waiting) return;
    setAskingAgain(true);
    setAgainError("");
    try {
      // On success the new pair replaces this one.
      await onAskAgain();
    } catch (error) {
      setAgainError(error?.message || "Couldn’t ask again. Try again.");
    } finally {
      setAskingAgain(false);
    }
  }

  return (
    <section className="nc no" aria-labelledby={`${id}-title`}>
      <p className="no-banner">
        <strong>Nautilus suggests, you decide.</strong> Nothing changes until you apply an option. Applying saves a new
        version{inReview ? ", and the review starts again with the same reviewers" : ""}.
      </p>

      <header className="no-head">
        <div className="no-head-text">
          <h2 className="no-title" id={`${id}-title`}>
            {options.length} ways to address the feedback
          </h2>
          <p className="nc-summary">
            Based on {commentCount} {commentCount === 1 ? "comment" : "comments"}, compared with the saved PRD. Options
            expire after 30 minutes.
          </p>
          {note ? <p className="no-note">Your note: {note}</p> : null}
        </div>
        <div className="nc-actions">
          {onAskAgain ? (
            <button type="button" className="nw-btn nw-btn-secondary ne-btn-38" onClick={askAgain} disabled={waiting}>
              {askingAgain ? "Asking…" : "Ask again"}
            </button>
          ) : null}
          <button type="button" className="nw-btn nw-btn-secondary ne-btn-38" onClick={onDiscard} disabled={waiting}>
            Discard
          </button>
        </div>
      </header>

      {againError ? (
        <p className="nw-error" role="alert">
          {againError}
        </p>
      ) : null}
      {notice}

      <ol className="no-list">
        {options.map((option) => {
          const isOpen = option.option === selected;
          const headingId = `${id}-option-${option.option}`;
          return (
            <li key={option.option} className={`no-card${isOpen ? " is-open" : ""}`}>
              <div className="no-card-top">
                <div className="no-card-text">
                  <span className="no-kicker">Option {option.option}</span>
                  <h3 className="no-card-title" id={headingId}>
                    {option.title || `Option ${option.option}`}
                  </h3>
                  {option.explanation ? <p className="no-explanation">{option.explanation}</p> : null}
                  {option.sectionTypes?.length ? (
                    <ul className="no-chips" aria-label="Sections it changes">
                      {option.sectionTypes.map((type) => (
                        <li key={type} className="no-chip">
                          {SECTION_LABELS[type] ?? type}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {option.tradeoffs?.length ? (
                  <div className="no-tradeoffs">
                    <span className="no-tradeoffs-label">Trade-offs</span>
                    <ul>
                      {option.tradeoffs.map((tradeoff, index) => (
                        <li key={index}>{tradeoff}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {isOpen ? null : (
                  <button
                    type="button"
                    className="nw-btn nw-btn-secondary ne-btn-38 no-preview"
                    onClick={() => open(option.option)}
                    disabled={waiting}
                    aria-describedby={headingId}
                  >
                    Preview
                  </button>
                )}
              </div>

              {isOpen ? (
                <div className="no-card-body">
                  <h4 className="no-kicker">What would change</h4>
                  <ChangedSections currentDocument={option.originalDocument} proposedDocument={option.proposedDocument} />

                  {onAdjust && asking ? (
                    <form className="nc-adjust no-adjust" onSubmit={adjust}>
                      <label className="nw-label" htmlFor={`${id}-adjust`}>
                        What should change in option {option.option}?
                      </label>
                      <textarea
                        id={`${id}-adjust`}
                        className="ne-comment-box"
                        rows={2}
                        maxLength={2000}
                        disabled={adjusting}
                        placeholder="For example: keep the original goals, only change the metrics."
                        value={request}
                        onChange={(event) => setRequest(event.target.value)}
                      />
                      <p className="nc-summary">The adjusted version replaces both options, so neither can be applied after that.</p>
                      {adjustError ? (
                        <p className="nw-error" role="alert">
                          {adjustError}
                        </p>
                      ) : null}
                      <div className="nc-adjust-actions">
                        <button
                          type="button"
                          className="nw-btn nw-btn-secondary ne-btn-34"
                          onClick={() => setAsking(false)}
                          disabled={adjusting}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="nw-btn nw-btn-primary ne-btn-34"
                          disabled={adjusting || !request.trim()}
                        >
                          {adjusting ? "Adjusting…" : `Adjust option ${option.option}`}
                        </button>
                      </div>
                    </form>
                  ) : null}

                  <div className="no-actions">
                    {onAdjust && !asking ? (
                      <button
                        type="button"
                        className="nw-btn nw-btn-secondary ne-btn-38"
                        onClick={() => setAsking(true)}
                        disabled={waiting}
                      >
                        Request adjustments
                      </button>
                    ) : null}
                    <button type="button" className="nw-btn nw-btn-primary ne-btn-38" onClick={onAccept} disabled={waiting}>
                      {busy ? "Applying…" : `Apply option ${option.option}`}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
