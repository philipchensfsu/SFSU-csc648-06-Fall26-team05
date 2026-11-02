import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";
import "./inbox.css";
import { IconArrowRight, IconCheck, IconClock, IconComment, IconFlag, IconRefresh, IconUserPlus } from "./icons";
import {
  approvalSummary,
  groupNotifications,
  notificationMeta,
  notificationSentence,
  notificationTone,
} from "./notifications";
import { Alert } from "./ui";

const TONE_ICONS = {
  changes: IconFlag,
  comment: IconComment,
  approved: IconCheck,
  people: IconUserPlus,
};

function ToneIcon({ item }) {
  const tone = notificationTone(item.type);
  let Icon = TONE_ICONS[tone];
  if (tone === "attention") Icon = item.type === "superseded" ? IconRefresh : IconClock;
  return (
    <span className={`nw-inbox-icon nw-inbox-icon-${tone}`}>
      <Icon size={17} strokeWidth={2} />
    </span>
  );
}

function NotificationRow({ item, busy, onOpen }) {
  const sentence = notificationSentence(item);
  const unread = !item.read_at;
  return (
    <li>
      <button
        type="button"
        className={`nw-inbox-row${unread ? "" : " is-read"}`}
        disabled={busy}
        onClick={() => onOpen(item)}
      >
        <span className="nw-inbox-dot" aria-hidden="true" />
        {unread ? <span className="nw-sr">Unread: </span> : null}
        <ToneIcon item={item} />
        <span className="nw-inbox-body">
          <span className="nw-inbox-text">
            {sentence.actor ? <strong>{sentence.actor}</strong> : null}
            {sentence.actor ? ` ${sentence.verb} ` : null}
            <strong className="nw-inbox-title">{item.title}</strong>
            {sentence.after}
          </span>
          <span className="nw-inbox-meta">{notificationMeta(item)}</span>
        </span>
      </button>
    </li>
  );
}

// A PRD in one of the approval tabs. Owners, version and reviewers only come
// with its detail read, so they fill in afterwards.
function ApprovalCard({ prd, action, onOpen }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let current = true;
    api
      .getPrd(prd.id)
      .then((row) => {
        if (current) setDetail(row);
      })
      .catch(() => {
        if (current) setDetail({ failed: true });
      });
    return () => {
      current = false;
    };
  }, [prd.id]);

  const reviewers = detail?.approval?.reviewers ?? [];
  const owners = (detail?.owners ?? []).map((owner) => owner.name ?? "Unnamed member").join(", ");
  const version = detail?.current_version?.version_no;
  return (
    <article className="nw-inbox-card">
      <div className="nw-inbox-card-head">
        <h3 className="nw-card-title">{prd.title}</h3>
        {version ? <span className="nw-inbox-version">v{version}</span> : null}
      </div>
      {prd.description ? <p className="nw-inbox-card-text">{prd.description}</p> : null}
      {owners ? <p className="nw-inbox-card-owner">{owners} · owner</p> : null}
      {reviewers.length ? (
        <div className="nw-inbox-bars" aria-hidden="true">
          {reviewers.map((reviewer) => (
            <span key={reviewer.user_id} className={`nw-inbox-bar nw-inbox-bar-${reviewer.state}`} />
          ))}
        </div>
      ) : null}
      <p className="nw-inbox-card-text">
        {detail?.failed ? "Review details aren’t available." : detail ? approvalSummary(detail.approval) : "Loading…"}
      </p>
      <div>
        <button type="button" className="nw-btn nw-btn-primary" onClick={() => onOpen(prd.id)}>
          {action}
          <IconArrowRight />
        </button>
      </div>
    </article>
  );
}

// Assignments, review requests, comments and decisions on PRDs this person is
// part of. There's no realtime: the list is read when the page opens.
function InboxPage({ onUnreadChange, onOpenPrdById }) {
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [unread, setUnread] = useState(0);
  const [mine, setMine] = useState(null);
  const [waiting, setWaiting] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  const publishUnread = useCallback(
    (count) => {
      setUnread(count);
      onUnreadChange?.(count);
    },
    [onUnreadChange],
  );

  const load = useCallback(() => {
    return Promise.all([
      api.listNotifications(),
      api.listPrdsInView("needs_my_approval"),
      api.listPrdsInView("waiting_for_approval"),
    ])
      .then(([page, needsMe, waitingOn]) => {
        setLoadError("");
        setItems(page.items);
        setCursor(page.next_cursor);
        publishUnread(page.unread_count);
        setMine(needsMe);
        setWaiting(waitingOn);
      })
      .catch((error) => setLoadError(error?.message || "Try again."));
  }, [publishUnread]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    setBusy(true);
    setProblem("");
    try {
      const page = await api.listNotifications({ cursor });
      setItems((known) => [...known, ...page.items]);
      setCursor(page.next_cursor);
      publishUnread(page.unread_count);
    } catch (error) {
      setProblem(error?.message || "Couldn’t load more. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Marks it read and opens its PRD. A PRD that can't be opened any more
  // (404) has usually left the list by the next read.
  async function openNotification(item) {
    setBusy(true);
    setProblem("");
    try {
      if (!item.read_at) {
        const saved = await api.markNotificationRead(item.id);
        setItems((known) => known.map((row) => (row.id === item.id ? saved : row)));
        publishUnread(Math.max(0, unread - 1));
      }
      await onOpenPrdById(item.prd_id);
    } catch (error) {
      setProblem(
        error?.status === 404
          ? "You can’t open this PRD any more."
          : error?.message || "Couldn’t open this PRD. Try again.",
      );
      load();
    } finally {
      setBusy(false);
    }
  }

  // The API marks one at a time, so this walks every unread page, including
  // notifications not loaded here yet.
  async function markAllRead() {
    setBusy(true);
    setProblem("");
    try {
      let next = null;
      do {
        const page = await api.listNotifications({ unreadOnly: true, limit: 100, cursor: next });
        await Promise.all(page.items.map((item) => api.markNotificationRead(item.id)));
        next = page.next_cursor;
      } while (next);
      const readAt = new Date().toISOString();
      setItems((known) => known.map((row) => (row.read_at ? row : { ...row, read_at: readAt })));
      publishUnread(0);
    } catch (error) {
      setProblem(error?.message || "Couldn’t mark everything as read. Try again.");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function openPrd(id) {
    setProblem("");
    try {
      await onOpenPrdById(id);
    } catch (error) {
      setProblem(error?.status === 404 ? "You can’t open this PRD any more." : error?.message || "Try again.");
      load();
    }
  }

  const tabs = [
    { id: "all", label: "All", count: unread },
    { id: "mine", label: "Needs my approval", count: mine?.length ?? 0 },
    { id: "waiting", label: "Waiting for approval", count: waiting?.length ?? 0 },
  ];
  const loaded = items !== null;

  return (
    <div className="nw-page">
      <div className="nw-head">
        <div>
          <h1 className="nw-h1">Inbox</h1>
          <p className="nw-lede">Assignments, review requests, comments and decisions on PRDs you’re part of.</p>
        </div>
        {unread > 0 ? (
          <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={markAllRead}>
            <IconCheck size={16} strokeWidth={1.8} />
            Mark all as read
          </button>
        ) : null}
      </div>

      {problem ? <Alert onDismiss={() => setProblem("")}>{problem}</Alert> : null}
      {loadError ? (
        <Alert onRetry={load}>
          <strong>Couldn’t load your inbox.</strong> {loadError}
        </Alert>
      ) : null}

      {!loaded && !loadError ? (
        <p className="nw-loading" role="status">
          Loading your inbox…
        </p>
      ) : null}

      {loaded ? (
        <>
          <div className="nw-filters" role="group" aria-label="Inbox views">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="nw-filter"
                aria-pressed={tab === entry.id}
                onClick={() => setTab(entry.id)}
              >
                {entry.label} · {entry.count}
              </button>
            ))}
          </div>

          {tab === "all" && items.length === 0 ? (
            <p className="nw-inbox-empty">Nothing yet. You’ll see invites, review requests and comments here.</p>
          ) : null}

          {tab === "all" && items.length > 0 ? (
            <section className="nw-inbox-list" aria-label="All notifications">
              {groupNotifications(items).map((group) => (
                <div key={group.label}>
                  <h2 className="nw-inbox-group">{group.label}</h2>
                  <ul className="nw-inbox-rows">
                    {group.items.map((item) => (
                      <NotificationRow key={item.id} item={item} busy={busy} onOpen={openNotification} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : null}

          {tab === "all" && cursor ? (
            <div>
              <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={loadMore}>
                Load more
              </button>
            </div>
          ) : null}

          {tab === "mine" ? (
            mine.length ? (
              <section className="nw-inbox-cards" aria-label="Needs my approval">
                {mine.map((prd) => (
                  <ApprovalCard key={prd.id} prd={prd} action="Review now" onOpen={openPrd} />
                ))}
              </section>
            ) : (
              <p className="nw-inbox-empty">Nothing needs your approval right now.</p>
            )
          ) : null}

          {tab === "waiting" ? (
            waiting.length ? (
              <section className="nw-inbox-cards" aria-label="Waiting for approval">
                {waiting.map((prd) => (
                  <ApprovalCard key={prd.id} prd={prd} action="Open PRD" onOpen={openPrd} />
                ))}
              </section>
            ) : (
              <p className="nw-inbox-empty">None of your PRDs are waiting for approval.</p>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default InboxPage;
