import { Fragment } from "react";
import Logo from "../Logo";
import { isAnswered, isSkipped } from "../questions";

// The top bar of the PRD screens: wordmark, breadcrumbs, actions on the
// right and, optionally, a second row (the interview progress).
// crumbs: [{ label, onClick? , current? }]
export function FlowBar({ width, crumbs, lead = "divider", onHome, actions, children }) {
  return (
    <header className="nf-bar">
      <div className="nf-bar-row" style={{ maxWidth: width }}>
        <button type="button" className="nw-logo-link nf-logo" aria-label="Nautilus dashboard" onClick={onHome}>
          <Logo height={19} />
        </button>
        {lead === "divider" ? <span className="nf-divider" aria-hidden="true" /> : null}
        <nav aria-label="Breadcrumb" className="nf-crumbs">
          {crumbs.map((crumb, index) => (
            <Fragment key={index}>
              {index > 0 || lead === "slash" ? (
                <span className="nf-sep" aria-hidden="true">
                  /
                </span>
              ) : null}
              {crumb.onClick ? (
                <button type="button" className="nf-crumb" onClick={crumb.onClick}>
                  {crumb.label}
                </button>
              ) : (
                <span
                  className={crumb.current ? "nf-crumb-current" : "nf-crumb-text"}
                  aria-current={crumb.current ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </Fragment>
          ))}
        </nav>
        {actions ? <div className="nf-bar-actions">{actions}</div> : null}
      </div>
      {children ? (
        <div className="nf-bar-row nf-bar-sub" style={{ maxWidth: width }}>
          {children}
        </div>
      ) : null}
    </header>
  );
}

// "Answers saved" / "Saving…" / "Couldn't save — Retry"
export function SaveState({ pending, failure, onRetry }) {
  if (failure) {
    return (
      <span className="nf-saved is-error" role="alert">
        <span className="nf-saved-dot" aria-hidden="true" />
        Couldn’t save
        <button type="button" className="nf-saved-retry" onClick={onRetry}>
          Retry
        </button>
      </span>
    );
  }
  return (
    <span className={`nf-saved${pending ? " is-saving" : ""}`} role="status">
      <span className="nf-saved-dot" aria-hidden="true" />
      {pending ? "Saving…" : "Answers saved"}
    </span>
  );
}

// The little fish that marks the current step on the progress bar.
function StepFish() {
  return (
    <span className="nf-stepfish" aria-hidden="true">
      <span className="nf-bob">
        <svg viewBox="0 0 48 30" width="26" height="16.2" focusable="false">
          <path className="nw-tail" d="M3 5 L16 15 L3 25 Q7 15 3 5 Z" fill="#1D6F7A" />
          <path d="M22 5 Q28 -1 34 5 Z" fill="#1D6F7A" />
          <ellipse cx="28" cy="15" rx="16" ry="10.5" fill="#85D1DB" />
          <path d="M22 6.5 Q18.5 15 22 23.5" fill="none" stroke="#B3EBF2" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="36.5" cy="12.5" r="3.4" fill="#FFFFFF" />
          <circle cx="37.2" cy="12.8" r="2" fill="#102C33" />
          <path d="M40.5 18.5 q-2 1.6 -4 .6" fill="none" stroke="#102C33" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    </span>
  );
}

// One segment per question: dark when answered, aqua with the fish on
// `current`, pale otherwise.
export function ProgressBar({ questions, answers, current, valueText }) {
  return (
    <div
      className="nf-progress"
      role="progressbar"
      aria-label="Interview progress"
      aria-valuemin={1}
      aria-valuemax={questions.length}
      aria-valuenow={current + 1}
      aria-valuetext={valueText}
    >
      {questions.map((question, index) => {
        let state = "";
        if (index === current) state = "is-current";
        else if (isAnswered(question, answers)) state = "is-done";
        return (
          <span key={question.id} className={state}>
            {index === current ? <StepFish /> : null}
          </span>
        );
      })}
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function Spark({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z" />
    </svg>
  );
}

// The question list down the left of the interview and review screens.
// `canOpen(index)` decides which steps are links; `review` adds the final
// "Review & generate" step ({ current, onClick } or null).
export function Stepper({ questions, answers, currentIndex = -1, canOpen, onOpen, review, showComplete = true }) {
  return (
    <nav aria-label="Interview steps" className="nf-steps-nav">
      <ol className="nf-steps">
        {questions.map((question, index) => {
          const current = index === currentIndex;
          const skipped = !current && !question.required && isSkipped(question, answers);
          const done = !current && !skipped && isAnswered(question, answers);
          let state = "is-todo";
          if (current) state = "is-current";
          else if (skipped) state = "is-skipped";
          else if (done) state = "is-done";
          let sub = null;
          if (current) sub = question.required ? "In progress · required" : "In progress";
          else if (skipped) sub = "Skipped · optional";
          else if (done && showComplete) sub = "Complete";
          const inner = (
            <>
              <span className="nf-step-dot">
                {done ? <CheckMark /> : skipped ? "!" : index + 1}
              </span>
              {sub ? (
                <span className="nf-step-text">
                  <span>{question.label}</span>
                  <span className="nf-step-sub">{sub}</span>
                </span>
              ) : (
                <span>
                  {question.label}
                  {state === "is-todo" && question.required ? <span className="nf-step-req"> · required</span> : null}
                </span>
              )}
            </>
          );
          return (
            <li key={question.id}>
              {canOpen(index) ? (
                <button
                  type="button"
                  className={`nf-step ${state}`}
                  aria-current={current ? "step" : undefined}
                  onClick={() => onOpen(index)}
                >
                  {inner}
                </button>
              ) : (
                <span className={`nf-step ${state}`} aria-current={current ? "step" : undefined}>
                  {inner}
                </span>
              )}
            </li>
          );
        })}
        {review ? (
          <li>
            {review.current ? (
              <span className="nf-step is-current" aria-current="step">
                <span className="nf-step-dot">
                  <Spark />
                </span>
                Review &amp; generate
              </span>
            ) : (
              <button type="button" className="nf-step is-todo nf-step-review" onClick={review.onClick}>
                <span className="nf-step-dot">
                  <Spark />
                </span>
                Review &amp; generate
              </button>
            )}
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
