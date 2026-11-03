import { useEffect, useRef, useState } from "react";
import "../workspace.css";
import "./flow.css";
import { FlowBar, ProgressBar, SaveState, Stepper } from "./FlowBar";
import { IconArrowRight, IconPlus, IconX } from "../icons";
import { Alert } from "../ui";
import { createAnswerSaver } from "./answerSaver";
import {
  MAX_GROUPS,
  MAX_GROUP_LENGTH,
  isAnswered,
  parseAnswer,
  partMaxLength,
  serializeAnswer,
} from "../questions";

const AUTOSAVE_MS = 800;
const MINUTES_PER_QUESTION = 1.3;
const LETTERS = "ABCDEFG";

function IconArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

// The discovery interview: one question per screen, each split into parts
// (A, B, C) that are saved together as that question's answer. Answers save
// as you type (after a short pause) and when you move between questions.
//
// prd.answers holds server-confirmed answers ({ question_key: text }).
// Unsaved edits stay on this page until every write succeeds. startAt opens a given
// question (from the review screen's Edit links).
function InterviewPage({
  prd,
  questions,
  startAt = null,
  onSaveAnswer,
  onExit,
  onHome = onExit,
  onReview,
}) {
  const [answers, setAnswers] = useState(prd.answers);
  const [index, setIndex] = useState(() => {
    const requested = questions.findIndex((question) => question.id === startAt);
    if (requested >= 0) return requested;
    const open = questions.findIndex((question) => !isAnswered(question, answers));
    return open >= 0 ? open : 0;
  });
  const [values, setValues] = useState(() =>
    Object.fromEntries(questions.map((question) => [question.id, parseAnswer(question, answers[question.id])])),
  );
  const [error, setError] = useState("");
  // null while not adding a user group, otherwise the text being typed.
  const [groupDraft, setGroupDraft] = useState(null);
  const [{ pending, failure }, setStatus] = useState({ pending: 0, failure: null });
  const [saver] = useState(() => createAnswerSaver(onSaveAnswer, setStatus));
  const [debouncing, setDebouncing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const navigating = useRef(false);
  const latestValues = useRef(values);
  const edited = useRef(new Set());
  const sent = useRef({ ...answers });
  const timer = useRef(null);
  const waiting = useRef(null);
  const fields = useRef({});
  const groupInput = useRef(null);
  const question = questions[index];
  const current = values[question.id];
  const last = questions.length - 1;

  // Hands a question's text to the saver when it changed. Saving an empty
  // answer for the first time is what marks an optional question skipped,
  // so that only happens when the person moves on (`markSkipped`).
  function commit(target, targetValues, markSkipped) {
    const known = target.id in sent.current;
    if (!edited.current.has(target.id) && (known || !markSkipped || target.required)) return;
    const text = serializeAnswer(target, targetValues);
    edited.current.delete(target.id);
    if (known ? sent.current[target.id] === text : !text && !markSkipped) return;
    sent.current[target.id] = text;
    setAnswers((all) => ({ ...all, [target.id]: text }));
    saver.save(target.id, text);
  }

  function flush(markSkipped = false) {
    clearTimeout(timer.current);
    waiting.current = null;
    setDebouncing(false);
    commit(question, latestValues.current[question.id], markSkipped);
  }

  // A tab close/reload cannot wait for asynchronous writes; warn while any
  // debounce, request or failed answer remains. In-app exits await drain().
  useEffect(() => {
    function beforeUnload(event) {
      if (!waiting.current && !saver.hasUnsaved() && !groupInput.current?.value.trim()) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [saver]);

  useEffect(() => {
    document.title = `Nautilus — ${question.label}`;
    window.scrollTo(0, 0);
    fields.current[question.parts[0].key]?.focus({ preventScroll: true });
  }, [question]);

  function update(patch) {
    if (navigating.current) return;
    const next = { ...latestValues.current[question.id], ...patch };
    const target = question;
    latestValues.current = { ...latestValues.current, [target.id]: next };
    setValues(latestValues.current);
    edited.current.add(target.id);
    setAnswers((all) => ({ ...all, [target.id]: serializeAnswer(target, next) }));
    setDebouncing(true);
    if (error) setError("");
    clearTimeout(timer.current);
    const run = () => {
      waiting.current = null;
      setDebouncing(false);
      commit(target, next, false);
    };
    waiting.current = run;
    timer.current = setTimeout(run, AUTOSAVE_MS);
  }

  function goTo(nextIndex) {
    if (navigating.current) return;
    flush(false);
    setError("");
    setGroupDraft(null);
    setIndex(nextIndex);
  }

  function next() {
    if (navigating.current) return;
    if (question.required && !serializeAnswer(question, latestValues.current[question.id])) {
      setError(`${question.label} is required. Add an answer to continue.`);
      fields.current[question.parts[0].key]?.focus();
      return;
    }
    flush(true);
    setGroupDraft(null);
    if (index === last) {
      leave(onReview);
      return;
    }
    setError("");
    setIndex(index + 1);
  }

  async function leave(to) {
    if (navigating.current) return;
    navigating.current = true;
    setLeaving(true);
    setError("");
    flush(false);
    try {
      await saver.drain();
      to();
    } catch (reason) {
      setError(`Your answers are still here. Couldn’t finish saving: ${reason.message}`);
    } finally {
      navigating.current = false;
      setLeaving(false);
    }
  }

  async function retry() {
    flush(false);
    try {
      await saver.drain();
      setError("");
    } catch (reason) {
      setError(`Your answers are still here. Couldn’t finish saving: ${reason.message}`);
    }
  }

  function addGroup(close) {
    const name = (groupDraft ?? "").replace(/;/g, ",").trim().slice(0, MAX_GROUP_LENGTH);
    const exists = current.groups.some((group) => group.toLowerCase() === name.toLowerCase());
    if (name && !exists && current.groups.length < MAX_GROUPS) {
      update({ groups: [...current.groups, name] });
    }
    setGroupDraft(close || current.groups.length + 1 >= MAX_GROUPS ? null : "");
  }

  function addTip(part, tip) {
    const text = current[part.key];
    const joiner = text && !text.endsWith("\n") ? "\n" : "";
    update({ [part.key]: `${text}${joiner}${tip}: `.slice(0, partMaxLength(question)) });
    requestAnimationFrame(() => {
      const field = fields.current[part.key];
      if (!field) return;
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    });
  }

  function onFieldKeyDown(event) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      next();
    }
  }

  const left = questions.filter((item) => !isAnswered(item, answers)).length;
  const firstOpen = questions.findIndex((item) => !isAnswered(item, answers));
  const reach = firstOpen === -1 ? last : Math.max(firstOpen, index);
  const requiredDone = questions.every((item) => !item.required || isAnswered(item, answers));
  const multi = question.parts.length > 1;
  const errorId = `nf-q-error-${question.id}`;

  return (
    <div className="nw-root nw-flow">
      <FlowBar
        width={1240}
        onHome={() => leave(onHome)}
        crumbs={[
          { label: "Dashboard", onClick: () => leave(onHome) },
          { label: prd.title },
          { label: "Discovery interview", current: true },
        ]}
        actions={
          <>
            <SaveState pending={pending || debouncing} failure={failure} onRetry={retry} />
            <button type="button" className="nf-exit" disabled={leaving} onClick={() => leave(onExit)}>
              {leaving ? "Saving…" : "Save & exit"}
            </button>
          </>
        }
      >
        <ProgressBar
          questions={questions}
          answers={answers}
          current={index}
          valueText={`Question ${index + 1} of ${questions.length}`}
        />
        <span className="nf-progress-text">
          <strong>
            Question {index + 1} of {questions.length}
          </strong>{" "}
          · {left ? `about ${Math.max(1, Math.round(left * MINUTES_PER_QUESTION))} min left` : "ready to review"}
        </span>
      </FlowBar>

      <div className="nf-page nf-interview">
        <Stepper
          questions={questions}
          answers={answers}
          currentIndex={index}
          canOpen={(at) => at <= reach || questions[at].id in answers}
          onOpen={goTo}
          review={requiredDone ? { current: false, onClick: () => leave(onReview) } : null}
        />

        <main className="nf-main">
          {failure ? <Alert onRetry={retry}>{failure.message} Your answers are kept here until saved.</Alert> : null}
          <div className="nf-q-head">
            <div className="nf-eyebrow">
              Question {index + 1} of {questions.length} · {question.label} ·{" "}
              {question.required ? "Required" : "Optional"}
            </div>
            <h1 className="nf-title">{question.title(prd.title)}</h1>
            <p className="nf-intro">{question.intro}</p>
          </div>

          {question.parts.map((part, partIndex) => {
            const fieldId = `nf-${question.id}-${part.key}`;
            const headingId = `${fieldId}-h`;
            return (
              <section key={`${question.id}-${part.key}`} className="nf-part" aria-labelledby={headingId}>
                <h2 id={headingId} className="nf-part-title">
                  {multi ? <span className="nf-part-letter">{LETTERS[partIndex]}</span> : null}
                  {part.groups ? part.label : <label htmlFor={fieldId}>{part.label}</label>}
                </h2>
                {part.groups ? (
                  <>
                    <ul className="nf-groups" aria-label="User groups">
                      {current.groups.map((group) => (
                        <li key={group} className="nf-group">
                          {group}
                          <button
                            type="button"
                            className="nf-group-x"
                            aria-label={`Remove ${group}`}
                            onClick={() => update({ groups: current.groups.filter((item) => item !== group) })}
                          >
                            <IconX size={12} strokeWidth={2.4} />
                          </button>
                        </li>
                      ))}
                      <li className="nf-group-add">
                        {groupDraft === null ? (
                          current.groups.length < MAX_GROUPS ? (
                            <button type="button" className="nf-add-group" onClick={() => setGroupDraft("")}>
                              <IconPlus size={14} strokeWidth={2} />
                              Add user group
                            </button>
                          ) : null
                        ) : (
                          <input
                            ref={groupInput}
                            className="nf-group-input"
                            disabled={leaving}
                            aria-label="New user group"
                            placeholder="Name the group, then press Enter"
                            value={groupDraft}
                            maxLength={MAX_GROUP_LENGTH}
                            autoFocus
                            onChange={(event) => setGroupDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addGroup(false);
                              } else if (event.key === "Escape") {
                                event.preventDefault();
                                setGroupDraft(null);
                              }
                            }}
                            onBlur={() => addGroup(true)}
                          />
                        )}
                      </li>
                    </ul>
                    <label htmlFor={fieldId} className="nf-sublabel">
                      {part.textLabel}
                    </label>
                  </>
                ) : null}
                <textarea
                  ref={(element) => {
                    fields.current[part.key] = element;
                  }}
                  id={fieldId}
                  className="nf-textarea"
                  disabled={leaving}
                  rows={part.rows}
                  value={current[part.key]}
                  maxLength={partMaxLength(question)}
                  aria-invalid={error && partIndex === 0 ? true : undefined}
                  aria-describedby={error && partIndex === 0 ? errorId : undefined}
                  onChange={(event) => update({ [part.key]: event.target.value })}
                  onKeyDown={onFieldKeyDown}
                />
                {part.tips ? (
                  <div className="nf-tips">
                    <span>Try covering:</span>
                    {part.tips.map((tip) => (
                      <button key={tip} type="button" className="nf-tip" onClick={() => addTip(part, tip)}>
                        {tip}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}

          {error ? (
            <p id={errorId} className="nf-q-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="nf-nav">
            {index > 0 ? (
              <button type="button" className="nf-back" onClick={() => goTo(index - 1)}>
                <IconArrowLeft />
                Back: {questions[index - 1].label}
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="nw-btn nw-btn-primary nf-next-btn" disabled={leaving} onClick={next}>
              {index === last ? "Review answers" : `Continue to ${questions[index + 1].label}`}
              <IconArrowRight />
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default InterviewPage;
