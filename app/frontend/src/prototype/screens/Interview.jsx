import { useEffect, useRef, useState } from "react";
import { QUESTIONS } from "../data";

function firstOpenQuestion(answers) {
  const index = QUESTIONS.findIndex((question) => !(question.id in answers));
  return index === -1 ? QUESTIONS.length - 1 : index;
}

function Interview({ prd, onChange, onDone, onSaveForLater }) {
  const answers = prd.answers;
  const [step, setStep] = useState(() => firstOpenQuestion(answers));
  const [draft, setDraft] = useState(answers[QUESTIONS[step].id] ?? "");
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const question = QUESTIONS[step];

  useEffect(() => {
    inputRef.current?.focus();
  }, [step]);

  function moveTo(nextStep) {
    setStep(nextStep);
    setDraft(answers[QUESTIONS[nextStep].id] ?? "");
    setError("");
  }

  function submit(value) {
    if (question.required && !value.trim()) {
      setError("Error: this question is required. Add an answer to continue.");
      inputRef.current?.focus();
      return;
    }
    onChange({ ...answers, [question.id]: value.trim() });
    if (step === QUESTIONS.length - 1) onDone();
    else moveTo(step + 1);
  }

  return (
    <div className="nt-layout">
      <nav className="nt-sidebar" aria-label="Interview progress">
        <p className="nt-prd-title">{prd.title}</p>
        <p className="nt-muted nt-small">Guided questions</p>
        <p className="nt-sidebar-heading">Discovery</p>
        <ol className="nt-steps">
          {QUESTIONS.map((item, index) => {
            const done = item.id in answers && index !== step;
            const reachable = index <= firstOpenQuestion(answers);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`nt-step${index === step ? " is-current" : ""}${done ? " is-done" : ""}`}
                  aria-current={index === step ? "step" : undefined}
                  disabled={!reachable}
                  onClick={() => moveTo(index)}
                >
                  <span className="nt-step-num" aria-hidden="true">
                    {done ? "✓" : index + 1}
                  </span>
                  <span>
                    {item.label}
                    {item.required ? "" : " (optional)"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="nt-main nt-chat-main">
        <div className="nt-card nt-chat">
          <div className="nt-chat-head">
            <strong>Nautilus assistant</strong>
            <span className="nt-eyebrow">
              Question {step + 1} of {QUESTIONS.length}
            </span>
          </div>

          <ol className="nt-chat-log" aria-label="Conversation">
            {QUESTIONS.slice(0, step).map((item) => (
              <li key={item.id}>
                <p className="nt-bubble nt-bubble-ai">{item.prompt}</p>
                <p className="nt-bubble nt-bubble-user">
                  {answers[item.id] || <em>Skipped</em>}
                </p>
              </li>
            ))}
            <li aria-live="polite">
              <p className="nt-bubble nt-bubble-ai">
                {question.prompt}{" "}
                <span className="nt-muted">
                  {question.required ? "Required." : "Optional."} {question.hint}
                </span>
              </p>
            </li>
          </ol>

          <form
            className="nt-chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              submit(draft);
            }}
          >
            <label htmlFor="answer">
              Your answer{" "}
              <span className="nt-req">
                {question.required ? "(Required)" : "(Optional)"}
              </span>
            </label>
            <textarea
              id="answer"
              ref={inputRef}
              rows={3}
              value={draft}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "answer-error" : undefined}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit(draft);
                }
              }}
            />
            {error ? (
              <p id="answer-error" className="nt-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="nt-actions">
              <button type="submit" className="nt-btn nt-btn-primary">
                {step === QUESTIONS.length - 1 ? "Review answers" : "Next"}
              </button>
              {question.required ? null : (
                <button
                  type="button"
                  className="nt-btn nt-btn-secondary"
                  onClick={() => submit("")}
                >
                  Skip
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="nt-chat-foot">
          <span className="nt-muted nt-small">Answers are saved as you go</span>
          <div className="nt-actions">
            <button
              type="button"
              className="nt-btn nt-btn-ghost"
              disabled={step === 0}
              onClick={() => moveTo(step - 1)}
            >
              Back
            </button>
            <button type="button" className="nt-btn nt-btn-secondary" onClick={onSaveForLater}>
              Save and continue later
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Interview;
