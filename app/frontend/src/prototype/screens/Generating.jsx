import { useEffect, useRef, useState } from "react";

const LABELS = { done: "Done", active: "In progress", waiting: "Waiting", failed: "Failed", idle: "Not started" };

function Generating({ prd, done, shouldFail, onFinish, onCancel, onBackToReview, onOpen }) {
  // phase: 0 sending, 1 drafting, 2 saving, "failed"
  const [phase, setPhase] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  });

  useEffect(() => {
    if (done) return undefined;
    let active = true;
    const timers = [
      setTimeout(() => setPhase(1), 700),
      setTimeout(() => setPhase(shouldFail ? "failed" : 2), 2600),
    ];
    if (!shouldFail) timers.push(setTimeout(() => {
      Promise.resolve().then(() => onFinishRef.current()).catch((error) => {
        if (!active) return;
        setSaveError(error?.message || "Couldn’t save your PRD. Try again.");
        setPhase("failed");
      });
    }, 3600));
    return () => { active = false; timers.forEach(clearTimeout); };
  }, [attempt, done, shouldFail]);

  if (done) {
    const assumptions = (prd.sections ?? []).reduce(
      (total, section) => total + (section.assumptions ?? 0),
      0,
    );
    return (
      <main className="nt-main nt-narrow">
        <p className="nt-prd-title">{prd.title}</p>
        <section className="nt-card nt-center-card">
          <div className="nt-success-mark" aria-hidden="true">✓</div>
          <h1>Your PRD is ready</h1>
          <p className="nt-muted">
            {prd.sections?.length ?? 9} sections were drafted from your answers.
            {assumptions > 0
              ? " Review the items marked Assumption in the editor."
              : ""}
          </p>
          <div className="nt-actions nt-actions-center">
            <button type="button" className="nt-btn nt-btn-primary" onClick={onOpen} autoFocus>
              Open PRD
            </button>
            <button type="button" className="nt-btn nt-btn-secondary" onClick={onBackToReview}>
              Back to answers
            </button>
          </div>
        </section>
      </main>
    );
  }

  const failed = phase === "failed";
  const steps = [
    ["Answers sent", phase === 0 ? "active" : "done"],
    [
      "Drafting 9 sections",
      failed ? "failed" : phase === 1 ? "active" : phase === 2 ? "done" : "waiting",
    ],
    ["Saving PRD", failed ? "idle" : phase === 2 ? "active" : "waiting"],
  ];

  return (
    <main className="nt-main nt-narrow">
      <p className="nt-prd-title">{prd.title}</p>
      <section className="nt-card nt-center-card" aria-live="polite">
        <h1>Generating your PRD</h1>
        {failed ? (
          <p className="nt-error" role="alert">
            {saveError || "We couldn’t generate your PRD. Your answers are saved."}
          </p>
        ) : (
          <p className="nt-muted">Your answers are saved. You can stay on this page.</p>
        )}
        <ol className="nt-progress">
          {steps.map(([label, state]) => (
            <li key={label} className={`nt-progress-step is-${state}`}>
              <span className="nt-progress-icon" aria-hidden="true">
                {state === "done" ? "✓" : state === "failed" ? "!" : ""}
              </span>
              <span className="nt-progress-label">{label}</span>
              <span className="nt-progress-state">{LABELS[state]}</span>
            </li>
          ))}
        </ol>
        <div className="nt-actions nt-actions-center">
          {failed ? (
            <>
              <button
                type="button"
                className="nt-btn nt-btn-primary"
                onClick={() => {
                  setSaveError("");
                  setPhase(0);
                  setAttempt((count) => count + 1);
                }}
              >
                Try again
              </button>
              <button type="button" className="nt-btn nt-btn-secondary" onClick={onBackToReview}>
                Back to review
              </button>
            </>
          ) : (
            <button type="button" className="nt-btn nt-btn-secondary" disabled={phase === 2} onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

export default Generating;
