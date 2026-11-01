import { useEffect, useRef, useState } from "react";
import "../workspace.css";
import "../flow/flow.css";
import "./editor.css";
import { FlowBar } from "../flow/FlowBar";
import { assumptionCount, plural } from "../format";
import { IconArrowRight, IconDoc } from "../icons";
import { PRD_SECTIONS, QUESTIONS } from "../questions";

const STAGE_MS = 2600;

// The six steps the screen walks through while the draft is written. The
// API writes the whole PRD in one request, so while it runs these advance
// on a timer (holding on the last one) and only turn into "done" for real
// when the response arrives.
function stagesFor(answers) {
  const answered = QUESTIONS.filter((question) => answers[question.id]?.trim()).length;
  const skipped = QUESTIONS.filter((question) => !answers[question.id]?.trim()).length;
  const metricsSkipped = !answers.success_metrics?.trim();
  return [
    ["Reading your interview answers", `${plural(answered, "answer")}${skipped ? `, ${skipped} skipped` : ""}`],
    ["Drafting problem, goals and non-goals", "Sections 1–3"],
    ["Writing target users and user stories", "From your Target users answer"],
    ["Defining requirements", "Numbered FR-01, FR-02… and linked to stories"],
    [
      "Setting success metrics",
      metricsSkipped ? "Suggested, and marked as assumptions to confirm" : "From your Success metrics answer",
    ],
    ["Checking for gaps", "Risks, open questions and assumptions to confirm"],
  ];
}

// Which step each of the nine sections belongs to (for the preview).
const SECTION_STAGE = [1, 1, 1, 2, 2, 3, 4, 5, 5];

function Spinner() {
  return (
    <svg className="ne-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="#D3F0F4" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="#1D6F7A" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Tick({ size = 12, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="m5 12 5 5L20 7" />
    </svg>
  );
}

function SwimmingFish() {
  return (
    <span className="ne-pfish-bob">
      <svg viewBox="0 0 48 30" width="30" height="18.8" focusable="false">
        <path className="nw-tail" d="M3 5 L16 15 L3 25 Q7 15 3 5 Z" fill="#1D6F7A" />
        <path d="M22 5 Q28 -1 34 5 Z" fill="#1D6F7A" />
        <ellipse cx="28" cy="15" rx="16" ry="10.5" fill="#85D1DB" />
        <path d="M22 6.5 Q18.5 15 22 23.5" fill="none" stroke="#B3EBF2" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="36.5" cy="12.5" r="3.4" fill="#FFFFFF" />
        <circle cx="37.2" cy="12.8" r="2" fill="#102C33" />
        <path d="M40.5 18.5 q-2 1.6 -4 .6" fill="none" stroke="#102C33" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// "Building your PRD": shows generation running, done or failed. The app
// owns the request (generation = { status: "running" | "done" | "failed",
// startedAt, error, unavailable }); this page only draws it, so leaving
// and coming back never starts a second one.
function GeneratingPage({
  prd,
  generation,
  exitLabel = "Back to dashboard",
  onRetry,
  onDraftFromAnswers,
  onOpen,
  onBackToAnswers,
  onExit,
  onHome,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");
  const running = generation.status === "running";
  const done = generation.status === "done";
  const failed = generation.status === "failed";

  useEffect(() => {
    document.title = "Nautilus — Generating PRD";
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(timer);
  }, [running]);

  // A finished draft opens by itself after a moment.
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  });
  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(() => openRef.current(), 2500);
    return () => clearTimeout(timer);
  }, [done]);

  const stages = stagesFor(prd.answers);
  const elapsed = Math.max(0, now - generation.startedAt);
  const stage = done ? stages.length : Math.min(stages.length - 1, Math.floor(elapsed / STAGE_MS));
  const withinStage = Math.min(1, (elapsed % STAGE_MS) / STAGE_MS);
  const percent = done ? 100 : Math.min(92, Math.round(6 + stage * 15 + withinStage * 12));
  const assumptions = done ? assumptionCount(prd) : 0;

  function startFromAnswers() {
    setDrafting(true);
    setDraftError("");
    Promise.resolve(onDraftFromAnswers()).catch((error) => {
      setDrafting(false);
      setDraftError(error?.message || "Couldn’t start the PRD. Try again.");
    });
  }

  let heading;
  let lede;
  if (done) {
    heading = (
      <>
        Your PRD is <span className="nw-serif nw-hl">ready</span>
      </>
    );
    lede = `All ${PRD_SECTIONS.length} sections drafted.${
      assumptions ? ` ${plural(assumptions, "statement is", "statements are")} marked as assumptions for you to confirm.` : ""
    }`;
  } else if (failed && generation.unavailable) {
    heading = "AI drafting isn’t set up yet";
    lede =
      "This server can’t write PRDs with AI yet. You can start the PRD from your interview answers instead: each answer goes into its section, nothing is made up, and you write the rest in the editor.";
  } else if (failed) {
    heading = "Couldn’t build your PRD";
    lede = `${generation.error} Your answers are saved.`;
  } else {
    heading = (
      <>
        Building your <span className="nw-serif nw-hl">PRD</span>
      </>
    );
    lede = `Nautilus is turning your interview answers into the ${PRD_SECTIONS.length} standard sections. You can leave this page — we’ll keep going.`;
  }

  return (
    <div className="nw-root nw-flow">
      <FlowBar
        width={1240}
        onHome={onHome}
        crumbs={[
          { label: "Dashboard", onClick: onHome },
          { label: prd.title },
          { label: "Generating PRD", current: true },
        ]}
      />
      <main className="nf-page ne-gen">
        <section className="ne-gen-main" aria-live="polite">
          <div className="ne-gen-head">
            <div className="nf-eyebrow">{prd.title} · PRD</div>
            <h1 className="ne-gen-title">{heading}</h1>
            <p className="ne-gen-lede">{lede}</p>
          </div>

          {failed ? null : (
            <>
              <div className="ne-progress">
                <div className="ne-meter">
                  <div className="ne-meter-track">
                    <div className="ne-meter-fill" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="ne-pfish" style={{ left: `${percent}%` }} aria-hidden="true">
                    <SwimmingFish />
                    {running ? (
                      <>
                        <span className="ne-pbubble" />
                        <span className="ne-pbubble ne-pbubble-late" />
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="ne-meter-text">
                  <span>{done ? "Complete" : `${stages[stage][0]}…`}</span>
                  <span className="nw-mono">{percent}%</span>
                </div>
              </div>
              <ol className="ne-stages">
                {stages.map(([label, detail], index) => {
                  const state = index < stage ? "is-done" : index === stage ? "is-active" : "is-todo";
                  return (
                    <li key={label} className={`ne-stage ${state}`}>
                      <span className="ne-stage-icon">
                        {state === "is-done" ? <Tick /> : state === "is-active" ? <Spinner /> : null}
                      </span>
                      <span className="ne-stage-text">
                        <span className="ne-stage-label">{label}</span>
                        <span className="ne-stage-detail">{detail}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          {draftError ? (
            <p className="ne-gen-error" role="alert">
              {draftError}
            </p>
          ) : null}

          <div className="ne-gen-actions">
            {done ? (
              <>
                <button type="button" className="nw-btn nw-btn-primary ne-btn-48" onClick={onOpen}>
                  Open PRD editor
                  <IconArrowRight />
                </button>
                <span className="ne-gen-note">Opening automatically…</span>
              </>
            ) : null}
            {failed && !generation.unavailable ? (
              <button type="button" className="nw-btn nw-btn-primary ne-btn-48" onClick={onRetry}>
                Try again
              </button>
            ) : null}
            {failed ? (
              <button
                type="button"
                className={`nw-btn ${generation.unavailable ? "nw-btn-primary" : "nw-btn-secondary"} ne-btn-48`}
                onClick={startFromAnswers}
                disabled={drafting}
              >
                {drafting ? "Starting…" : "Start from my answers"}
              </button>
            ) : null}
            {failed ? (
              <button type="button" className="nw-btn nw-btn-secondary ne-btn-42" onClick={onBackToAnswers}>
                Back to answers
              </button>
            ) : null}
            {running ? (
              <button type="button" className="nw-btn nw-btn-secondary ne-btn-42" onClick={onExit}>
                {exitLabel}
              </button>
            ) : null}
          </div>
        </section>

        <section className="ne-preview" aria-label="PRD preview">
          <div className="ne-preview-head">
            <IconDoc size={16} />
            <span className="ne-preview-title">{prd.title} PRD</span>
            <span className="ne-preview-count">
              {done ? PRD_SECTIONS.length : 0} / {PRD_SECTIONS.length} sections
            </span>
          </div>
          <ol className="ne-preview-list">
            {PRD_SECTIONS.map((section, index) => {
              const group = SECTION_STAGE[index];
              const reached = done || (!failed && group <= stage);
              const active = running && group === stage;
              return (
                <li key={section.id} className={`ne-preview-item${reached ? " is-reached" : ""}`}>
                  <span className="ne-preview-row">
                    <span className="ne-preview-num">{index + 1}</span>
                    <span className="ne-preview-name">{section.label}</span>
                    {done ? <Tick size={14} color="#1C9A62" /> : null}
                  </span>
                  {active || (running && group < stage) ? (
                    <span className={`ne-preview-lines${active ? " is-active" : ""}`} aria-hidden="true">
                      <span />
                      <span />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
}

export default GeneratingPage;
