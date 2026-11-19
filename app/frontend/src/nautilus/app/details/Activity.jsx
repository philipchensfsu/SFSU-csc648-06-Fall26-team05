import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../../../../lib/api";
import { formatDayTime } from "../format";
import { IconCheck, IconClock, IconComment, IconPencil, IconPlus, IconRefresh, IconUserPlus } from "../icons";
import { ACTIVITY_FILTERS, activityKind, activityLink } from "./details";

const EMPTY_FEED = { items: [], nextCursor: null, loading: true, error: null };

const KIND_ICONS = {
  edits: IconPencil,
  people: IconUserPlus,
  comments: IconComment,
  reviews: IconCheck,
  work: IconRefresh,
  other: IconClock,
};

// One line of the feed: an icon for its kind, the backend's sentence as is,
// when, and a link when there's something to open.
function ActivityItem({ event, onOpenVersion, onOpenComments }) {
  const kind = activityKind(event.type);
  const Icon = KIND_ICONS[kind];
  const link = activityLink(event);
  return (
    <li className="nd-act">
      <span className={`nd-act-icon nd-act-${kind}`}>
        <Icon size={14} />
      </span>
      <div className="nd-act-body">
        <p className="nd-act-text">{event.summary}</p>
        <span className="nd-muted">{formatDayTime(event.created_at)}</span>
      </div>
      {link ? (
        <button
          type="button"
          className="ne-link-btn nd-act-link"
          onClick={() => (link.kind === "version" ? onOpenVersion(link.versionId) : onOpenComments())}
        >
          {link.label}
        </button>
      ) : null}
    </li>
  );
}

// The feed has no "created" event yet (docs: Activity), so the oldest line
// comes from the PRD's own created_at.
function CreatedItem({ createdAt }) {
  return (
    <li className="nd-act">
      <span className="nd-act-icon nd-act-other">
        <IconPlus size={14} />
      </span>
      <div className="nd-act-body">
        <p className="nd-act-text">The PRD was created</p>
        <span className="nd-muted">{formatDayTime(createdAt)}</span>
      </div>
    </li>
  );
}

// The Activity tab (feature 03, E13): everything that happened to the PRD,
// newest first, filtered by kind and a page at a time.
// Props:
//   prdId, createdAt   the PRD, and when it was made (for the last line)
//   onOpenVersion(id)  a saved version in History
//   onOpenComments()   the editor's Comments tab
export function ActivityTab({ prdId, createdAt, onOpenVersion, onOpenComments }) {
  const ids = useId();
  const [filter, setFilter] = useState("all");
  const [feed, setFeed] = useState(EMPTY_FEED);
  // Only the newest request may fill the feed, so a slow answer for the
  // previous chip can't land after a faster one.
  const latest = useRef(0);

  const fetchPage = useCallback(
    (filterId, cursor = null) => {
      const request = ++latest.current;
      const types = ACTIVITY_FILTERS.find((item) => item.id === filterId)?.types ?? [];
      api
        .listPrdEvents(prdId, { types, cursor })
        .then((page) => {
          if (request !== latest.current) return;
          setFeed((current) => ({
            items: cursor ? [...current.items, ...page.items] : page.items,
            nextCursor: page.next_cursor,
            loading: false,
            error: null,
          }));
        })
        .catch((error) => {
          if (request === latest.current) setFeed((current) => ({ ...current, loading: false, error: error.message }));
        });
    },
    [prdId],
  );

  useEffect(() => {
    fetchPage("all");
  }, [fetchPage]);

  function pick(filterId) {
    if (filterId === filter) return;
    setFilter(filterId);
    setFeed(EMPTY_FEED);
    fetchPage(filterId);
  }

  function retry() {
    setFeed(EMPTY_FEED);
    fetchPage(filter);
  }

  function showOlder() {
    setFeed((current) => ({ ...current, loading: true, error: null }));
    fetchPage(filter, feed.nextCursor);
  }

  const { items, nextCursor, loading, error } = feed;
  // The created line closes the full feed once its last page is in.
  const showCreated = filter === "all" && createdAt && !nextCursor && !loading && !error;

  return (
    <section className="ne-card nd-activity" aria-labelledby={`${ids}-title`}>
      <div className="ne-card-head">
        <h2 id={`${ids}-title`} className="ne-card-title">
          Activity
        </h2>
      </div>
      <p className="nd-muted nd-activity-intro">Everything that happened to this PRD, newest first.</p>

      <div className="nd-chips" role="group" aria-label="Show">
        {ACTIVITY_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nd-chip${filter === item.id ? " is-active" : ""}`}
            aria-pressed={filter === item.id}
            onClick={() => pick(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!items.length && loading ? (
        <p className="nd-muted" role="status">
          Loading activity…
        </p>
      ) : null}
      {!items.length && error ? (
        <div className="nd-error" role="alert">
          Couldn’t load the activity. {error}{" "}
          <button type="button" className="nw-btn nw-btn-secondary nd-btn-sm" onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}
      {!items.length && !loading && !error && !showCreated ? (
        <p className="nd-muted">Nothing of this kind yet.</p>
      ) : null}

      {items.length || showCreated ? (
        <ol className="nd-acts">
          {items.map((event) => (
            <ActivityItem
              key={event.id}
              event={event}
              onOpenVersion={onOpenVersion}
              onOpenComments={onOpenComments}
            />
          ))}
          {showCreated ? <CreatedItem createdAt={createdAt} /> : null}
        </ol>
      ) : null}

      {items.length && error ? (
        <div className="nd-error" role="alert">
          Couldn’t load older activity. {error}
        </div>
      ) : null}
      {nextCursor ? (
        <button type="button" className="nw-btn nw-btn-secondary nd-more" onClick={showOlder} disabled={loading}>
          {loading ? "Loading…" : "Show older activity"}
        </button>
      ) : null}
    </section>
  );
}

const RECENT = 3;

// The Overview's "Recent activity" card: the newest few events and a way to
// the full feed.
// Props: prdId, onSeeAll()
export function RecentActivityCard({ prdId, onSeeAll }) {
  const ids = useId();
  const [events, setEvents] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    api
      .listPrdEvents(prdId, { limit: RECENT })
      .then((page) => current && setEvents(page.items ?? []))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [prdId]);

  return (
    <section className="ne-card" aria-labelledby={`${ids}-title`}>
      <div className="ne-card-head">
        <h2 id={`${ids}-title`} className="ne-card-title">
          Recent activity
        </h2>
        <button type="button" className="ne-link-btn" onClick={onSeeAll}>
          See all
        </button>
      </div>
      {failed ? (
        <p className="nd-muted">Couldn’t load the latest activity.</p>
      ) : events === null ? (
        <p className="nd-muted">Loading…</p>
      ) : events.length ? (
        <ol className="nd-recent">
          {events.map((event) => (
            <li key={event.id}>
              <p className="nd-act-text">{event.summary}</p>
              <span className="nd-muted">{formatDayTime(event.created_at)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="nd-muted">Nothing has happened yet.</p>
      )}
    </section>
  );
}
