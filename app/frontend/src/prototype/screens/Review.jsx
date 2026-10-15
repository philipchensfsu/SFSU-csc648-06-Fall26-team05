import { useState } from "react";
import { QUESTIONS } from "../data";

function Review({ prd, onChange, onBack, onGenerate }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const answers = prd.answers;
  const missingRequired = QUESTIONS.some(
    (question) => question.required && !answers[question.id],
  );

  function save(id) {
    onChange({ ...answers, [id]: draft.trim() });
    setEditing(null);
  }

  return (
    <main className="nt-main nt-narrow">
      <p className="nt-prd-title">{prd.title}</p>
      <h1>Review your answers</h1>
      <p className="nt-muted">
        Edit anything before the PRD is generated. The first three are required.
      </p>

      <ol className="nt-review-list">
        {QUESTIONS.map((question, index) => {
          const value = answers[question.id];
          const isEditing = editing === question.id;
          return (
            <li key={question.id} className="nt-card nt-review-item">
              <div className="nt-review-head">
                <h2 className="nt-eyebrow">
                  {String(index + 1).padStart(2, "0")} · {question.label}
                </h2>
                <span className={`nt-tag${question.required ? " nt-tag-strong" : ""}`}>
                  {question.required ? "Required" : "Optional"}
                </span>
              </div>
              {isEditing ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    save(question.id);
                  }}
                >
                  <label htmlFor={`edit-${question.id}`} className="nt-sr-only">
                    {question.label}
                  </label>
                  <textarea
                    id={`edit-${question.id}`}
                    rows={3}
                    autoFocus
                    required={question.required}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <div className="nt-actions">
                    <button type="submit" className="nt-btn nt-btn-primary nt-btn-sm">
                      Save
                    </button>
                    <button
                      type="button"
                      className="nt-btn nt-btn-secondary nt-btn-sm"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="nt-review-body">
                  <p className={value ? "" : "nt-muted"}>
                    {value || (question.required ? "Not answered yet" : "Skipped")}
                  </p>
                  <button
                    type="button"
                    className="nt-btn nt-btn-ghost nt-btn-sm"
                    aria-label={`Edit ${question.label}`}
                    onClick={() => {
                      setEditing(question.id);
                      setDraft(value ?? "");
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="nt-actions nt-actions-end">
        <button type="button" className="nt-btn nt-btn-secondary" onClick={onBack}>
          Back to questions
        </button>
        <button
          type="button"
          className="nt-btn nt-btn-primary"
          disabled={missingRequired}
          onClick={onGenerate}
        >
          Generate PRD
        </button>
      </div>
    </main>
  );
}

export default Review;
