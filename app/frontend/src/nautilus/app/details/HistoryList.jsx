import { formatDayTime, initialsOf } from "../format";
import { Avatar } from "../ui";
import { contributors, originLabel, sectionLabel, versionAuthor } from "./details";

const REMOVAL_REASONS = {
  removed: "removed from the round",
  reviewer_deactivated: "left: account deactivated",
  reviewer_removed: "left: no longer on the PRD",
};

// "replaced by Ben Lee", or why they left. The replacement is still on the
// round, or was later taken off it too.
function removalText(person, round) {
  if (person.reason === "replaced") {
    const replacement =
      (round.reviewers ?? []).find((reviewer) => reviewer.user_id === person.replaced_by) ??
      (round.removed_reviewers ?? []).find((removed) => removed.user_id === person.replaced_by);
    return replacement?.name ? `replaced by ${replacement.name}` : "replaced";
  }
  return REMOVAL_REASONS[person.reason] ?? "removed from the round";
}

// Reviewers taken off the review rounds on one version.
function RemovedReviewers({ rounds }) {
  const withRemovals = rounds.filter((round) => round.removed_reviewers?.length);
  if (!withRemovals.length) return null;
  return (
    <div className="nd-removed">
      {withRemovals.map((round) => (
        <div key={round.id}>
          <span className="nd-muted">Review round {round.round_no}: reviewers changed</span>
          <ul aria-label={`Reviewers removed from review round ${round.round_no}`}>
            {round.removed_reviewers.map((person, index) => (
              <li key={`${person.user_id ?? "former"}-${person.removed_at}-${index}`}>
                <strong>{person.name ?? "A former member"}</strong> {removalText(person, round)}
                {person.removed_at ? <span className="nd-muted"> · {formatDayTime(person.removed_at)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// The History tab: every saved version, newest first, a page at a time.
// Props:
//   versions        { items, nextCursor, loading, error } from the page
//   rounds          the PRD's review rounds (GET .../reviews), for the
//                   reviewers taken off each version's rounds
//   currentVersionId  the PRD's current version, marked and not compared
//   onView(id), onCompare(id), onLoadMore(), onRetry()
export default function HistoryList({ versions, rounds = [], currentVersionId, onView, onCompare, onLoadMore, onRetry }) {
  const { items, nextCursor, loading, error } = versions;
  const people = contributors(items);

  if (!items.length && loading) return <p className="nd-muted" role="status">Loading versions…</p>;
  if (!items.length && error) {
    return (
      <div className="nd-error" role="alert">
        Couldn’t load the history. {error}{" "}
        <button type="button" className="nw-btn nw-btn-secondary nd-btn-sm" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (!items.length) {
    return <p className="nd-muted">No versions yet. A version is saved each time someone saves the PRD.</p>;
  }

  return (
    <div className="nd-history">
      <div className="nd-history-intro">
        <p>Every save makes a version. Open one to read it, or compare it with the current PRD. Older versions can’t be edited.</p>
        {people.length ? (
          <div className="nd-contributors">
            <span className="nd-muted">Contributors</span>
            <ul aria-label="Contributors">
              {people.map((person) => (
                <li key={person.id} title={`${person.name}: ${person.count} ${person.count === 1 ? "save" : "saves"}`}>
                  <Avatar initials={initialsOf(person.name, null)} />
                  <span className="nw-sr">
                    {person.name}, {person.count} {person.count === 1 ? "save" : "saves"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <ol className="nd-versions">
        {items.map((version) => {
          const current = version.id === currentVersionId;
          const author = versionAuthor(version);
          const origin = originLabel(version.origin);
          const changed = version.changed_sections ?? [];
          return (
            <li key={version.id} className={`nd-version${current ? " is-current" : ""}`}>
              <span className="nd-vno">v{version.version_no}</span>
              <div className="nd-version-body">
                <div className="nd-version-head">
                  <Avatar initials={initialsOf(version.actor?.name ?? author, null)} />
                  <strong>{author}</strong>
                  <span className="nd-muted">{formatDayTime(version.created_at)}</span>
                  {current ? <span className="nw-chip nd-chip-current">Current version</span> : null}
                  {origin ? <span className="nw-chip nw-chip-draft">{origin}</span> : null}
                </div>
                {version.change_summary ? <p className="nd-version-summary">{version.change_summary}</p> : null}
                {changed.length ? (
                  <ul className="nd-sections" aria-label="Changed sections">
                    {changed.map((type) => (
                      <li key={type}>{sectionLabel(type)}</li>
                    ))}
                  </ul>
                ) : null}
                <RemovedReviewers rounds={rounds.filter((round) => round.version_id === version.id)} />
              </div>
              <div className="nd-version-actions">
                <button type="button" className="nw-btn nw-btn-secondary nd-btn-sm" onClick={() => onView(version.id)}>
                  View<span className="nw-sr"> version {version.version_no}</span>
                </button>
                {current ? null : (
                  <button
                    type="button"
                    className="nw-btn nw-btn-secondary nd-btn-sm"
                    onClick={() => onCompare(version.id)}
                  >
                    Compare with current<span className="nw-sr"> (version {version.version_no})</span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="nd-error" role="alert">
          Couldn’t load older versions. {error}
        </div>
      ) : null}
      {nextCursor ? (
        <button type="button" className="nw-btn nw-btn-secondary nd-more" onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading…" : "Show older versions"}
        </button>
      ) : null}
    </div>
  );
}
