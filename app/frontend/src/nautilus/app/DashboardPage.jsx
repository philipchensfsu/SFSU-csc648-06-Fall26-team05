import { useEffect, useMemo, useState } from "react";
import EmptyDashboard from "./EmptyDashboard";
import PrdTable from "./PrdTable";
import {
  assumptionCount,
  firstNameOf,
  formatDayTime,
  greeting,
  interviewProgress,
  listPhrase,
  plural,
  prdSummary,
} from "./format";
import { IconArrowRight, IconDoc, IconSearch } from "./icons";
import { InterviewMeter, StatusChip } from "./ui";

// "You have 2 drafts in progress, 1 PRD in review and 3 final PRDs."
function summaryLine(prds) {
  const count = (status) => prds.filter((prd) => prd.status === status).length;
  const parts = [];
  const drafts = count("draft");
  const inReview = count("in_review");
  const final = count("final");
  const assigned = count("assigned");
  if (drafts) parts.push(`${plural(drafts, "draft")} in progress`);
  if (inReview) parts.push(`${plural(inReview, "PRD")} in review`);
  if (final) parts.push(plural(final, "final PRD"));
  if (assigned) parts.push(plural(assigned, "assigned PRD"));
  return `You have ${listPhrase(parts)}.`;
}

// A draft or a PRD in review, with what to do next on it.
function AttentionCard({ prd, questions, onOpenPrd }) {
  const generated = Boolean(prd.sections);
  const progress = generated ? null : interviewProgress(prd, questions);
  const summary = prdSummary(prd);
  const assumptions = generated ? assumptionCount(prd) : 0;
  let action = "Open PRD";
  if (!generated) action = progress && !progress.next ? "Review answers" : "Continue interview";

  return (
    <article className={`nw-card nw-card-${prd.status}`}>
      <div className="nw-card-head">
        <StatusChip status={prd.status} />
        <span className="nw-card-date">{formatDayTime(prd.updatedAt)}</span>
      </div>
      <div>
        <h3 className="nw-card-title">{prd.title}</h3>
        {summary ? <p className="nw-card-text">{summary}</p> : null}
      </div>
      {generated ? (
        <p className="nw-card-meta">
          <IconDoc size={16} />
          {plural(prd.sections.length, "section")}
          {assumptions ? ` · ${plural(assumptions, "assumption")} to check` : ""}
        </p>
      ) : (
        <InterviewMeter progress={progress} total={questions.length} />
      )}
      <div className="nw-card-foot">
        <button type="button" className="nw-btn nw-btn-secondary" onClick={() => onOpenPrd(prd)}>
          {action}
          <IconArrowRight />
        </button>
      </div>
    </article>
  );
}

function DashboardPage({
  account,
  organization,
  prds,
  prdsLoaded,
  projects,
  questions,
  shortcut,
  onNavigate,
  onCreatePrd,
  onOpenPrd,
  onLoadAnswers,
  onRenamePrd,
  onDeletePrd,
}) {
  const [query, setQuery] = useState("");

  // Up to three drafts and PRDs in review, most recently touched first.
  const attention = useMemo(
    () => prds.filter((prd) => prd.status === "draft" || prd.status === "in_review").slice(0, 3),
    [prds],
  );

  // Interview progress needs each draft's saved answers.
  const needAnswers = attention
    .filter((prd) => !prd.sections && !prd.answersLoaded)
    .map((prd) => prd.id)
    .join(",");
  useEffect(() => {
    if (needAnswers) onLoadAnswers(needAnswers.split(","));
  }, [needAnswers, onLoadAnswers]);

  if (!prdsLoaded) {
    return (
      <div className="nw-page">
        <p className="nw-loading" role="status">
          Loading your PRDs…
        </p>
      </div>
    );
  }

  if (prds.length === 0) {
    return (
      <EmptyDashboard
        account={account}
        organization={organization}
        onCreatePrd={onCreatePrd}
        onOpenPeople={() => onNavigate({ page: "people" })}
      />
    );
  }

  const first = firstNameOf(account.name);

  // Typing here opens the search page with what was typed so far.
  function search(value) {
    setQuery(value);
    if (value.trim()) onNavigate({ page: "search", query: value });
  }

  return (
    <div className="nw-page">
      <div className="nw-head">
        <div>
          <h1 className="nw-h1">
            {greeting()}
            {first ? (
              <>
                , <span className="nw-serif">{first}</span>
              </>
            ) : null}
          </h1>
          <p className="nw-lede">{summaryLine(prds)}</p>
        </div>
        <form
          role="search"
          className="nw-search-box"
          onSubmit={(event) => {
            event.preventDefault();
            onNavigate({ page: "search", query });
          }}
        >
          <IconSearch size={16} strokeWidth={2} />
          <label htmlFor="nw-dash-q" className="nw-sr">
            Search PRDs
          </label>
          <input
            id="nw-dash-q"
            type="search"
            placeholder="Search PRDs"
            autoComplete="off"
            value={query}
            onChange={(event) => search(event.target.value)}
          />
          <kbd className="nw-kbd" aria-hidden="true">
            {shortcut}
          </kbd>
        </form>
      </div>

      {attention.length ? (
        <section className="nw-section" aria-labelledby="nw-att-h">
          <h2 id="nw-att-h" className="nw-h2">
            Pick up where you left off
          </h2>
          <div className="nw-cards">
            {attention.map((prd) => (
              <AttentionCard key={prd.id} prd={prd} questions={questions} onOpenPrd={onOpenPrd} />
            ))}
          </div>
        </section>
      ) : null}

      <PrdTable
        prds={prds}
        projects={projects}
        onOpenPrd={onOpenPrd}
        onOpenProject={(projectId) => onNavigate({ page: "projects", projectId })}
        onRenamePrd={onRenamePrd}
        onDeletePrd={onDeletePrd}
      />
    </div>
  );
}

export default DashboardPage;
