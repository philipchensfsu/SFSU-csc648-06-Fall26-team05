import { useEffect, useState } from "react";
import "../workspace.css";
import "./flow.css";
import { FlowBar, ProgressBar, Spark, Stepper } from "./FlowBar";
import { IconPencil } from "../icons";
import { listPhrase } from "../format";
import { PRD_SECTIONS, isAnswered, isSkipped, parseAnswer } from "../questions";
import { ConfirmDialog } from "../dialogs";

const EMPTY_HINTS = {
  notes: "No answer. Links or research notes help Nautilus, but you can generate without them.",
};

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1D6F7A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

function AlertCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.01" />
    </svg>
  );
}

// A saved answer shown back: one paragraph, or a labelled block per part
// for questions that have several.
function AnswerBody({ question, text }) {
  const values = parseAnswer(question, text);
  const parts = question.parts.filter((part) => values[part.key] || (part.groups && values.groups.length));
  if (question.parts.length === 1 || (parts.length === 1 && !parts[0].groups && parts[0] === question.parts[0])) {
    return <p className="nf-answer-text">{values[question.parts[0].key]}</p>;
  }
  return parts.map((part) => (
    <div key={part.key} className="nf-answer-part">
      <p className="nf-answer-label">{part.label}</p>
      {part.groups && values.groups.length ? (
        <ul className="nf-answer-groups" aria-label="User groups">
          {values.groups.map((group) => (
            <li key={group}>{group}</li>
          ))}
        </ul>
      ) : null}
      {values[part.key] ? <p className="nf-answer-text">{values[part.key]}</p> : null}
    </div>
  ));
}

// "Review your answers": every saved answer, how ready the PRD is to
// generate, and the Generate panel. Edit opens the interview at that
// question; onGenerate starts generation. A PRD that already has a draft
// asks before generating again, since the new draft replaces it, and offers
// the way back to it (onOpenDraft).
function ReviewPage({ prd, questions, onEdit, onGenerate, onOpenDraft, onExit, onHome = onExit }) {
  const [confirming, setConfirming] = useState(false);
  const hasDraft = Boolean(prd.sections);
  const answers = prd.answers;

  useEffect(() => {
    document.title = "Nautilus — Review answers";
    window.scrollTo(0, 0);
  }, []);

  const missing = questions.filter((question) => question.required && !isAnswered(question, answers));
  const skipped = questions.filter((question) => !question.required && !answers[question.id]?.trim());
  const answeredCount = questions.filter((question) => answers[question.id]?.trim()).length;
  const ready = missing.length === 0;

  let banner;
  if (!ready) {
    banner = {
      tone: "is-missing",
      title:
        missing.length === 1
          ? `${missing[0].label} isn’t answered yet`
          : `${missing.length} required questions aren’t answered yet`,
      text: `Answer ${listPhrase(missing.map((question) => question.label))} to generate the PRD.`,
      link: `Answer ${missing[0].label.toLowerCase()}`,
      target: missing[0].id,
    };
  } else if (skipped.length) {
    banner = {
      tone: "",
      title: `${answeredCount} of ${questions.length} questions answered — ${listPhrase(
        skipped.map((question) => question.label),
      )} skipped (optional)`,
      text: null,
      link: `Add ${skipped[0].label.toLowerCase()}`,
      target: skipped[0].id,
    };
  } else {
    banner = {
      tone: "is-ok",
      title: `All ${questions.length} questions answered`,
      text: "Nautilus has everything it asks for. You can still edit any answer.",
      link: null,
    };
  }

  return (
    <div className="nw-root nw-flow">
      <FlowBar
        width={1320}
        onHome={onHome}
        crumbs={[
          { label: "Dashboard", onClick: onHome },
          { label: prd.title },
          { label: "Discovery interview", current: true },
        ]}
        actions={
          <>
            <span className="nf-saved" role="status">
              <span className="nf-saved-dot" aria-hidden="true" />
              Answers saved
            </span>
            <button type="button" className="nf-exit" onClick={onExit}>
              Save &amp; exit
            </button>
          </>
        }
      >
        <ProgressBar
          questions={questions}
          answers={answers}
          current={questions.length - 1}
          valueText={`${answeredCount} of ${questions.length} questions answered`}
        />
        <span className="nf-progress-text">
          <strong>
            {questions.length} of {questions.length}
          </strong>{" "}
          · Review &amp; generate
        </span>
      </FlowBar>

      <div className="nf-page nf-review">
        <Stepper
          questions={questions}
          answers={answers}
          canOpen={() => true}
          onOpen={(index) => onEdit(questions[index].id)}
          review={{ current: true }}
          showComplete={false}
        />

        <main className="nf-review-main">
          <div className="nf-q-head">
            <div className="nf-eyebrow">Review &amp; generate</div>
            <h1 className="nf-title">
              Review your <span className="nw-serif">answers</span>
            </h1>
            <p className="nf-intro nf-intro-wide">
              This is everything Nautilus will use to write the PRD. Edit anything that doesn’t look right.
            </p>
          </div>

          <div className={`nf-ready ${banner.tone}`}>
            <AlertCircle />
            <div className="nf-ready-body">
              <strong>{banner.title}</strong>
              {ready && skipped.length ? (
                <span className="nf-ready-text">
                  All {questions.filter((question) => question.required).length} required questions are answered.
                  Anything Nautilus has to guess will be marked as an <em>assumption</em> for you to confirm.
                </span>
              ) : banner.text ? (
                <span className="nf-ready-text">{banner.text}</span>
              ) : null}
              {banner.link ? (
                <button type="button" className="nf-ready-link" onClick={() => onEdit(banner.target)}>
                  {banner.link}
                </button>
              ) : null}
            </div>
          </div>

          {questions.map((question, index) => {
            const text = answers[question.id]?.trim();
            const headingId = `nf-answer-${question.id}`;
            let tag = ["Optional", "nf-tag-optional"];
            if (question.required) tag = text ? ["Required", "nf-tag-required"] : ["Missing", "nf-tag-missing"];
            else if (!text) tag = ["Skipped", "nf-tag-skipped"];
            return (
              <section key={question.id} className="nf-answer" aria-labelledby={headingId}>
                <div className="nf-answer-head">
                  <span className="nf-answer-num">{String(index + 1).padStart(2, "0")}</span>
                  <h2 id={headingId} className="nf-answer-title">
                    {question.label}
                  </h2>
                  <span className={`nf-tag ${tag[1]}`}>{tag[0]}</span>
                  <button
                    type="button"
                    className="nf-answer-edit"
                    aria-label={`${text ? "Edit" : "Answer"} ${question.label}`}
                    onClick={() => onEdit(question.id)}
                  >
                    <IconPencil size={15} />
                    {text ? "Edit" : "Answer"}
                  </button>
                </div>
                <div className="nf-answer-body">
                  {text ? (
                    <AnswerBody question={question} text={text} />
                  ) : (
                    <p className="nf-answer-empty">
                      {question.required
                        ? "Not answered yet. This one is required."
                        : (EMPTY_HINTS[question.id] ??
                          (isSkipped(question, answers) ? "Skipped. You can generate without it." : "Not answered. You can generate without it."))}
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </main>

        <aside className="nf-gen" aria-labelledby="nf-gen-h">
          <div className="nf-gen-head">
            <h2 id="nf-gen-h" className="nf-gen-title">
              Generate your PRD
            </h2>
            <p className="nf-gen-sub">Build a draft from your saved answers. Answers stay editable afterwards.</p>
          </div>

          <div className="nf-fieldset">
            <h3 className="nf-legend">
              Sections <span className="nf-label-note">· all {PRD_SECTIONS.length} standard sections</span>
            </h3>
            <ul className="nf-sections">
              {PRD_SECTIONS.map((section) => (
                <li key={section.id}>
                  <Check />
                  {section.label}
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className="nf-generate"
            disabled={!ready}
            onClick={() => (hasDraft ? setConfirming(true) : onGenerate())}
          >
            <Spark size={18} />
            {hasDraft ? "Regenerate PRD" : "Generate PRD"}
          </button>
          <p className="nf-gen-note">
            {!ready
              ? "Answer the required questions first."
              : hasDraft
                ? "This PRD already has a draft. Generating again replaces it."
                : "You’ll review everything before it’s final. Nothing is shared until you choose to."}
          </p>
          {hasDraft && onOpenDraft ? (
            <button type="button" className="nw-btn nw-btn-secondary nf-open-draft" onClick={onOpenDraft}>
              Open the current draft
            </button>
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Replace the current draft?"
        confirmLabel="Regenerate"
        busyLabel="Starting…"
        onConfirm={() => onGenerate()}
        onClose={() => setConfirming(false)}
      >
        <p>
          Nautilus writes a new draft from your answers. It replaces every section of {prd.title}, including edits
          made in the editor.
        </p>
      </ConfirmDialog>
    </div>
  );
}

export default ReviewPage;
