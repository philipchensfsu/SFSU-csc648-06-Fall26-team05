import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../../../lib/api";
import { describeSummaryError, isSummaryOutdated, summaryGroups, summaryScope } from "./discussion";

const IDLE = { status: "idle", result: null, error: "" };

// One point in the summary, with a way to the comments it came from. Only
// comments the panel has loaded get a link.
function SummaryItem({ item, knownIds, onShowComments }) {
  const ids = (item.commentIds ?? []).filter((id) => knownIds.has(id));
  return (
    <li className="ne-summary-item">
      <p className="ne-summary-text">
        {item.heading ? <strong>{item.heading}: </strong> : null}
        {item.text}
      </p>
      {ids.length ? (
        <button type="button" className="ne-link-btn ne-summary-link" onClick={() => onShowComments(ids)}>
          {ids.length === 1 ? "Show the comment" : `Show the ${ids.length} comments`}
        </button>
      ) : null}
    </li>
  );
}

// "Summarize discussion" in the Comments panel (feature 05): an AI recap of
// the comments on the current version. Read-only, so anyone who can open the
// PRD can ask, viewers included, and every ask is a fresh summary.
// Props:
//   prdId
//   comments           the panel's comments, to link to and to notice new ones
//   currentVersionId   the version the panel posts to; the one summarized
//   onShowComments(ids)  scrolls to and highlights those comments ([] clears)
export default function DiscussionSummary({ prdId, comments, currentVersionId, onShowComments }) {
  const ids = useId();
  const [state, setState] = useState(IDLE);
  // Only the newest ask may fill the panel, and none after it's hidden.
  const latest = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function summarize() {
    const request = ++latest.current;
    setState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const result = await api.summarizeDiscussion(prdId, { versionId: currentVersionId ?? undefined });
      if (mounted.current && request === latest.current) setState({ status: "done", result, error: "" });
    } catch (error) {
      if (mounted.current && request === latest.current) {
        setState((current) => ({ ...current, status: "error", error: describeSummaryError(error) }));
      }
    }
  }

  function hide() {
    latest.current += 1;
    setState(IDLE);
    onShowComments([]);
  }

  if (state.status === "idle") {
    return (
      <button type="button" className="nw-btn nw-btn-secondary ne-btn-34 ne-summary-open" onClick={summarize}>
        Summarize discussion
      </button>
    );
  }

  const { status, result, error } = state;
  const loading = status === "loading";
  const groups = result ? summaryGroups(result.summary) : [];
  const knownIds = new Set((comments ?? []).map((comment) => comment.id));
  const outdated = result && !loading && isSummaryOutdated(result, currentVersionId, comments);

  return (
    <section className="ne-summary" aria-labelledby={`${ids}-title`} aria-busy={loading}>
      <div className="ne-summary-head">
        <h3 id={`${ids}-title`} className="ne-summary-title">
          Discussion summary
        </h3>
        <button type="button" className="ne-link-btn" onClick={hide}>
          Hide
        </button>
      </div>

      {loading && !result ? (
        <p className="ne-card-note" role="status">
          Reading the comments…
        </p>
      ) : null}

      {result ? (
        <>
          <p className="ne-summary-scope">AI summary · {summaryScope(result)}</p>
          {!result.comment_count ? (
            <p className="ne-card-note">No comments on this version yet, so there’s nothing to summarize.</p>
          ) : groups.length ? (
            groups.map((group) => (
              <div key={group.id} className="ne-summary-group">
                <h4 className="ne-summary-group-title">{group.title}</h4>
                <ul className="ne-summary-items">
                  {group.items.map((item, index) => (
                    <SummaryItem key={index} item={item} knownIds={knownIds} onShowComments={onShowComments} />
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="ne-card-note">Nothing stood out in these comments.</p>
          )}
          {outdated ? (
            <p className="ne-summary-note">There are new comments or a new version since this summary.</p>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : null}

      {result || error ? (
        <div className="ne-comment-actions">
          <button type="button" className="nw-btn nw-btn-secondary ne-btn-34" onClick={summarize} disabled={loading}>
            {loading ? "Summarizing…" : error && !result ? "Try again" : "Summarize again"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
