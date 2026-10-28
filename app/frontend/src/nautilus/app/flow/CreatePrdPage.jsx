import { useEffect, useId, useMemo, useRef, useState } from "react";
import "../workspace.css";
import "./flow.css";
import { FlowBar } from "./FlowBar";
import { IconArrowRight, IconFolder, IconX } from "../icons";
import { QUESTIONS } from "../questions";

const DESCRIPTION_MAX = 160;

function ChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// "Create a PRD": title, optional project, a one-line description and any
// early notes (saved as the interview's Notes answer). onCreate returns a
// promise; this page shows its error, and the app moves on to the
// interview when it succeeds. Cancel goes back where the person came from;
// the logo and the Dashboard crumb go to the dashboard.
function CreatePrdPage({ projects, initialProjectId = null, onCreate, onCancel, onHome = onCancel }) {
  const sorted = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects],
  );
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(() =>
    projects.some((project) => project.id === initialProjectId) ? initialProjectId : "",
  );
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [titleError, setTitleError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const submitting = useRef(false);
  const titleRef = useRef(null);
  const ids = {
    title: useId(),
    titleHelp: useId(),
    titleError: useId(),
    project: useId(),
    projectHelp: useId(),
    description: useId(),
    descriptionHelp: useId(),
    notes: useId(),
    notesHelp: useId(),
  };

  useEffect(() => {
    document.title = "Nautilus — New PRD";
    titleRef.current?.focus();
  }, []);

  function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (!title.trim()) {
      setTitleError("PRD title is required.");
      titleRef.current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    Promise.resolve().then(() =>
      onCreate({
        title: title.trim(),
        projectId: projectId || null,
        description: description.trim(),
        notes: notes.trim(),
      }),
    ).catch((reason) => {
      submitting.current = false;
      setBusy(false);
      setCreated(Boolean(reason?.draftCreated));
      setError(reason?.message || "Couldn’t create the PRD. Try again.");
    });
  }

  const dirty = Boolean(title || description || notes);
  useEffect(() => {
    if (!dirty && !busy) return undefined;
    function beforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);

  function leave(to) {
    if (submitting.current) return;
    if (dirty && !window.confirm(created
      ? "Leave without saving the remaining details? The draft already created will remain in your workspace."
      : "Discard these unsaved PRD details?")) return;
    to();
  }

  const notesQuestion = QUESTIONS.find((question) => question.id === "notes");

  return (
    <div className="nw-root nw-flow">
      <FlowBar
        width={1160}
        lead="slash"
        onHome={() => leave(onHome)}
        crumbs={[{ label: "Dashboard", onClick: () => leave(onHome) }, { label: "New PRD", current: true }]}
        actions={
          <button type="button" className="nf-cancel" disabled={busy} onClick={() => leave(onCancel)}>
            <IconX size={16} strokeWidth={2} />
            Cancel
          </button>
        }
      />

      <main className="nf-page nf-create">
        <form className="nf-form" onSubmit={submit} noValidate>
          <div className="nf-form-head">
            <h1 className="nw-h1">Create a PRD</h1>
            <p className="nf-muted">The basics. You’ll go deeper in the guided interview next.</p>
          </div>

          <fieldset className="nf-form-body" disabled={busy || created}>
            <div className="nf-grid2">
              <div className="nf-field">
                <label htmlFor={ids.title} className="nf-label">
                  PRD title <span className="nf-label-note">(required)</span>
                </label>
                <input
                  ref={titleRef}
                  id={ids.title}
                  className="nf-input"
                  value={title}
                  maxLength={200}
                  autoComplete="off"
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? `${ids.titleError} ${ids.titleHelp}` : ids.titleHelp}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    if (titleError) setTitleError("");
                  }}
                />
                {titleError ? (
                  <span id={ids.titleError} className="nf-field-error">
                    {titleError}
                  </span>
                ) : null}
                <span id={ids.titleHelp} className="nf-help">
                  How it appears on your dashboard and in the document.
                </span>
              </div>

              <div className="nf-field">
                <label htmlFor={ids.project} className="nf-label">
                  Project <span className="nf-label-note">(optional)</span>
                </label>
                <span className="nf-select-wrap">
                  <IconFolder size={16} className="nf-select-icon" />
                  <select
                    id={ids.project}
                    className="nf-select"
                    value={projectId}
                    aria-describedby={ids.projectHelp}
                    onChange={(event) => setProjectId(event.target.value)}
                  >
                    <option value="">No project</option>
                    {sorted.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  <span className="nf-select-chevron">
                    <ChevronDown />
                  </span>
                </span>
                <span id={ids.projectHelp} className="nf-help">
                  A folder for related PRDs.
                </span>
              </div>
            </div>

            <div className="nf-field">
              <div className="nf-label-row">
                <label htmlFor={ids.description} className="nf-label">
                  Short description
                </label>
                <span className="nf-count" aria-hidden="true">
                  {description.length} / {DESCRIPTION_MAX}
                </span>
              </div>
              <textarea
                id={ids.description}
                className="nf-textarea"
                rows={2}
                value={description}
                maxLength={DESCRIPTION_MAX}
                aria-describedby={ids.descriptionHelp}
                onChange={(event) => setDescription(event.target.value.replace(/\n/g, " "))}
              />
              <span id={ids.descriptionHelp} className="nf-help">
                One sentence: who it’s for and what it does.
              </span>
            </div>

            <div className="nf-field">
              <label htmlFor={ids.notes} className="nf-label">
                Initial idea or context <span className="nf-label-note">(optional)</span>
              </label>
              <textarea
                id={ids.notes}
                className="nf-textarea"
                rows={5}
                value={notes}
                maxLength={4800}
                aria-describedby={ids.notesHelp}
                onChange={(event) => setNotes(event.target.value)}
              />
              <span id={ids.notesHelp} className="nf-help">
                Notes, links you’ve jotted down, how the idea came about. Saved as your {notesQuestion.label}{" "}
                answer.
              </span>
            </div>
          </fieldset>

          {error ? (
            <p className="nf-form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="nf-form-foot">
            <span className="nf-help">You can rename it and edit your answers later.</span>
            <div className="nf-form-actions">
              <button type="button" className="nw-btn nw-btn-secondary nf-btn-44" onClick={() => leave(onCancel)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="nw-btn nw-btn-primary nf-btn-44 nf-btn-go" disabled={busy}>
                {busy ? "Saving…" : created ? "Retry saving & start interview" : "Create PRD & start interview"}
                {busy ? null : <IconArrowRight />}
              </button>
            </div>
          </div>
        </form>

        <aside className="nf-next" aria-labelledby="nf-next-h">
          <div className="nf-kicker">What happens next</div>
          <h2 id="nf-next-h" className="nf-next-title">
            Seven guided questions
          </h2>
          <ol className="nf-timeline">
            {QUESTIONS.map((question, index) => (
              <li key={question.id}>
                <span className="nf-timeline-num">{String(index + 1).padStart(2, "0")}</span>
                {question.label}
                {question.required ? <span className="nf-timeline-req">· required</span> : null}
              </li>
            ))}
          </ol>
          <div className="nf-next-notes">
            <div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#557479" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Then review your answers and generate. About 10 minutes, saved as you go.
            </div>
            <div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#557479" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="m5 12 5 5L20 7" />
              </svg>
              The first three are required. Skip the rest and Nautilus marks what it had to assume.
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default CreatePrdPage;
