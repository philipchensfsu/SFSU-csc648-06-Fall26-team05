import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api } from "../../../../lib/api";
import { PRD_SECTIONS } from "../questions";
import { formatDay, initialsOf } from "../format";
import DiscussionSummary from "./DiscussionSummary";
import { IconSparkle } from "./editorIcons";
import { MAX_MENTIONS, insertMention, matchPeople, mentionIds, mentionQuery, splitMentions } from "./mentions";

const SECTION_LABELS = Object.fromEntries(PRD_SECTIONS.map((section) => [section.id, section.label]));
const MAX_BODY = 5000;
// The backend takes 1 to 20 comments and an instruction of up to 2,000
// characters (review_suggestion.MAX_FEEDBACK_ITEMS / MAX_INSTRUCTION_CHARS).
const MAX_FEEDBACK = 20;
const MAX_INSTRUCTION = 2000;
// The shortcut that posts a comment, named the way this computer's keyboard does.
const SUBMIT_KEYS =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "") ? "⌘" : "Ctrl";

// The backend's own sentences are written to be shown; only the two the
// panel can act on are reworded here.
function describeError(error) {
  if (error?.code === "no_saved_version") return "Save the PRD before commenting on it.";
  if (error?.code === "stale_version") return "Someone saved this PRD since you opened it. Post again to comment on the latest version.";
  if (error?.code === "mention_without_access")
    return "Someone you mentioned can’t see this PRD any more. Remove their @mention, or share the PRD with them first.";
  return error?.message || "Couldn’t post your comment. Try again.";
}

// One comment. `body` is plain text from the API, so React escapes it and the
// CSS keeps its line breaks; it is never set as HTML.
// With `onToggle`, it can be picked for the AI to address (only comments on
// the current version can be). `highlighted` marks it as one the discussion
// summary pointed to.
// One of four avatar tints, the same for a person every time.
function tintOf(name) {
  let sum = 0;
  for (const char of name ?? "") sum = (sum + char.charCodeAt(0)) % 997;
  return sum % 4;
}

function Comment({ comment, currentVersionId, onToggle, picked = false, pickDisabled = false, highlighted = false }) {
  const author = comment.author ?? {};
  const section = SECTION_LABELS[comment.section_type];
  // Older comments say which version they were left on, as the design's "v2".
  const olderVersion = currentVersionId && comment.version_id !== currentVersionId;
  return (
    <article
      className={`ne-comment${picked ? " is-picked" : ""}${highlighted ? " is-highlighted" : ""}`}
      data-comment-id={comment.id}
      tabIndex={-1}
    >
      {onToggle ? (
        olderVersion ? (
          <p className="ne-comment-pick is-off">On an older version</p>
        ) : (
          <label className="ne-comment-pick">
            <input type="checkbox" checked={picked} disabled={pickDisabled && !picked} onChange={onToggle} />
            Address this
          </label>
        )
      ) : null}
      <div className="ne-comment-head">
        <span className={`ne-comment-avatar is-tint-${tintOf(author.name)}`} aria-hidden="true">
          {initialsOf(author.name) || "?"}
        </span>
        <span className="ne-comment-who">{author.name || "Someone"}</span>
        {author.department ? <span className="ne-comment-dept">{author.department}</span> : null}
        <span className="ne-comment-when">{formatDay(comment.created_at)}</span>
      </div>
      {section || olderVersion ? (
        <div className="ne-comment-where">
          <span className="ne-comment-section">{section ?? "Whole PRD"}</span>
          {olderVersion && comment.version_no ? <span className="ne-comment-ver">v{comment.version_no}</span> : null}
        </div>
      ) : null}
      <p className="ne-comment-body">
        {splitMentions(comment.body, comment.mentions).map((part, index) =>
          part.mention ? (
            <span key={index} className="ne-mention">
              {part.text}
            </span>
          ) : (
            part.text
          ),
        )}
      </p>
    </article>
  );
}

// Comments on one PRD, in the editor's side panel. Anyone who can view the
// PRD can read and post (Decision 5), so there is no capability check here;
// the API refuses anyone else.
//
// Props:
//   prd               the open PRD, for its id
//   currentVersionId  the PRD's current version, or null before the first
//                     save: the composer is disabled then, because the API
//                     answers 409 no_saved_version
//   onSuggest(ids, instruction)  owners only: asks the AI for one proposal
//                     addressing the picked comments; the editor then shows
//                     it to compare. Rejects with an Error whose message says
//                     why (shown here, with the picks and instruction kept)
//   onSuggestOptions(ids, instruction)  the same, asking for two different
//                     options to choose from (feature 09)
//   ownerView         the viewer owns the PRD. When every comment is on an
//                     older version (after a save) the AI can't address them,
//                     so "Ask AI to address" stays, disabled, with the reason
//   currentVersionNo  the saved version's number, to name it ("version 6")
//   onRefresh         reads the PRD's detail again after a stale_version
//                     refusal, for its new current version. Not the editor's
//                     full reload: that remounts the editor and loses the draft
//   userId            the signed-in person, left out of the @mention list
//                     (mentioning yourself notifies no one)
//   id, labelledBy, hidden   side panel wiring from EditorPage
export default function CommentsPanel({
  prd,
  currentVersionId,
  onSuggest,
  onSuggestOptions,
  ownerView = false,
  currentVersionNo = null,
  onRefresh,
  userId,
  id,
  labelledBy,
  hidden,
}) {
  const [comments, setComments] = useState(null);
  // Picking comments for the AI to address (owners, with onSuggest).
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [instruction, setInstruction] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  // @mentions: the PRD's people (read the first time someone types "@"), the
  // "@query" being typed, the highlighted suggestion, and who was picked.
  const [people, setPeople] = useState(null);
  const peopleRequested = useRef(false);
  const [query, setQuery] = useState(null);
  const [active, setActive] = useState(0);
  const [picks, setPicks] = useState([]);
  // Comments the discussion summary pointed to.
  const [highlighted, setHighlighted] = useState(() => new Set());
  // Which comments are listed: "current" (the saved version) or "earlier".
  const [tab, setTab] = useState("current");
  const mounted = useRef(true);
  const list = useRef(null);
  const box = useRef(null);
  const caretAfterPick = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // EditorPage keys this panel by PRD, so it remounts rather than reloading
  // in place: the fetch runs once and nothing has to be reset first.
  useEffect(() => {
    let current = true;
    api
      .listPrdComments(prd.id)
      .then((page) => current && setComments(page.items ?? []))
      .catch((error) => current && setLoadError(error.message || "Couldn’t load the comments."));
    return () => {
      current = false;
    };
  }, [prd.id]);

  // After picking someone, put the caret right after their name once the box
  // shows the new text.
  useEffect(() => {
    const caret = caretAfterPick.current;
    if (caret === null || !box.current) return;
    caretAfterPick.current = null;
    box.current.focus();
    box.current.setSelectionRange(caret, caret);
  }, [draft]);

  // Newest is last, so keep the end in view as comments arrive.
  useEffect(() => {
    // Optional call: jsdom has no scrollIntoView, so tests would throw here.
    if (!hidden) list.current?.lastElementChild?.scrollIntoView?.({ block: "nearest" });
  }, [comments, hidden]);

  async function post(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || posting || !currentVersionId) return;
    setPosting(true);
    setPostError("");
    try {
      const mentions = mentionIds(body, picks);
      const comment = await api.addPrdComment(prd.id, { versionId: currentVersionId, body, mentions });
      if (!mounted.current) return;
      setComments((current) => [...(current ?? []), comment]);
      setDraft("");
      setPicks([]);
      setQuery(null);
    } catch (error) {
      if (!mounted.current) return;
      // What they typed is kept; after the refresh, posting again uses the new version.
      setPostError(describeError(error));
      if (error?.code === "stale_version") onRefresh?.();
    } finally {
      if (mounted.current) setPosting(false);
    }
  }

  // The people who can see the PRD, once per panel. If it can't be read, the
  // picker just doesn't open; typing "@Name" by hand still posts as text.
  function loadPeople() {
    if (peopleRequested.current) return;
    peopleRequested.current = true;
    api
      .listPrdMembers(prd.id)
      .then((members) => mounted.current && setPeople(members ?? []))
      .catch(() => mounted.current && setPeople([]));
  }

  // Called on every edit and caret move: is an "@query" being typed?
  function trackQuery(field) {
    const found = mentionQuery(field.value, field.selectionStart);
    if (found) loadPeople();
    if (found?.start !== query?.start || found?.query !== query?.query) setActive(0);
    setQuery(found);
  }

  function choose(person) {
    const field = box.current;
    const caret = field?.selectionStart ?? draft.length;
    const next = insertMention(draft, query.start, caret, person);
    setDraft(next.text);
    setPicks((current) => (current.some((p) => p.user_id === person.user_id) ? current : [...current, person]));
    setQuery(null);
    caretAfterPick.current = next.caret;
  }

  // The @ button: starts a mention where the caret is and opens the list.
  function startMention() {
    const field = box.current;
    const caret = field?.selectionStart ?? draft.length;
    const space = caret > 0 && !/\s/.test(draft[caret - 1]) ? " " : "";
    const start = caret + space.length;
    setDraft(draft.slice(0, caret) + space + "@" + draft.slice(caret));
    caretAfterPick.current = start + 1;
    loadPeople();
    setActive(0);
    setQuery({ start, query: "" });
  }

  function onBoxKeyDown(event) {
    // Ctrl or ⌘ + Enter posts, unless the mention list is choosing someone.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !suggestions.length) {
      post(event);
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(suggestions[active] ?? suggestions[0]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery(null);
    }
  }

  // From the discussion summary: highlight those comments and bring the first
  // into view, focused so keyboard and screen reader users land on it.
  function showComments(ids) {
    setHighlighted(new Set(ids));
    if (!ids.length) return;
    // A comment on an earlier version switches to that tab first.
    const earlier = (comments ?? []).some(
      (comment) => comment.id === ids[0] && currentVersionId && comment.version_id !== currentVersionId,
    );
    const wanted = earlier ? "earlier" : "current";
    if (wanted !== tab) {
      flushSync(() => setTab(wanted));
    }
    const first = list.current?.querySelector(`[data-comment-id="${ids[0]}"]`);
    // Optional calls: jsdom has no scrollIntoView.
    first?.scrollIntoView?.({ block: "nearest" });
    first?.focus({ preventScroll: true });
  }

  function toggle(commentId) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  }

  // `ask` is onSuggest (one proposal) or onSuggestOptions (two to choose from).
  async function suggest(ask) {
    if (!picked.size || suggesting) return;
    setSuggesting(true);
    setSuggestError("");
    try {
      // On success the editor swaps to the comparison, which unmounts this.
      await ask([...picked], instruction.trim() || null);
    } catch (error) {
      if (mounted.current) setSuggestError(error?.message || "Couldn’t ask for changes. Try again.");
    } finally {
      if (mounted.current) setSuggesting(false);
    }
  }

  function stopPicking() {
    setPicking(false);
    setPicked(new Set());
    setSuggestError("");
  }

  const unsaved = !currentVersionId;
  const mentionedCount = mentionIds(draft, picks).length;
  const suggestions =
    query && people && mentionedCount < MAX_MENTIONS
      ? matchPeople(
          people.filter((person) => person.user_id !== userId),
          query.query,
        )
      : [];
  const listId = `${id}-mentions`;
  // Comments on the saved version are the ones that count now; older ones
  // stay, on their own tab, as the record of what was asked. Before the first
  // save there's no version to compare with, so they're all one list.
  const onCurrent = (comment) => !currentVersionId || comment.version_id === currentVersionId;
  const currentComments = (comments ?? []).filter(onCurrent);
  const earlierComments = (comments ?? []).filter((comment) => !onCurrent(comment));
  const pickable = Boolean(currentVersionId) && currentComments.length > 0;
  const versionName = currentVersionNo ? `version ${currentVersionNo}` : "the current version";
  const versionTab = currentVersionNo ? `Version ${currentVersionNo}` : "Current";
  // The "Address with AI" card, for owners. With no comments on the current
  // version it stays, disabled, with the reason.
  const canAddress = Boolean(onSuggest) && pickable;
  const addressBlocked = !canAddress && ownerView && Boolean(currentVersionId) && !pickable && earlierComments.length > 0;
  const reasonId = `${id}-ai-reason`;
  const showingEarlier = tab === "earlier" && earlierComments.length > 0 && !picking;
  const shown = showingEarlier ? earlierComments : currentComments;
  const pickedLabel = picked.size === 0 ? "None picked yet" : `${picked.size} picked`;

  function renderComment(comment) {
    return (
      <Comment
        key={comment.id}
        comment={comment}
        currentVersionId={currentVersionId}
        onToggle={picking ? () => toggle(comment.id) : undefined}
        picked={picked.has(comment.id)}
        pickDisabled={picked.size >= MAX_FEEDBACK || suggesting}
        highlighted={highlighted.has(comment.id)}
      />
    );
  }

  return (
    <section className="ne-card ne-comments" id={id} aria-labelledby={labelledBy} hidden={hidden}>
      <div className="ne-card-head">
        <h2 className="ne-card-title">Comments</h2>
        {comments?.length ? <span className="ne-card-count ne-comments-count">{comments.length}</span> : null}
      </div>

      {/* Address with AI: ready, picking, or blocked until someone comments
          on the current version. */}
      {picking ? (
        <section className="ne-ai-card is-picking" aria-label="Picking comments to address">
          <span className="ne-ai-card-text">
            <span className="ne-ai-card-title">Pick the comments to address</span>
            <span className="ne-ai-card-sub">
              {pickedLabel} · up to {MAX_FEEDBACK}, on {versionName} only
            </span>
          </span>
          <button type="button" className="nw-btn nw-btn-secondary ne-btn-34" onClick={stopPicking} disabled={suggesting}>
            Cancel
          </button>
        </section>
      ) : canAddress ? (
        <section className="ne-ai-card" aria-label="Address comments with Nautilus">
          <span className="ne-ai-card-icon" aria-hidden="true">
            <IconSparkle size={18} />
          </span>
          <span className="ne-ai-card-text">
            <span className="ne-ai-card-title">
              {currentComments.length} {currentComments.length === 1 ? "comment" : "comments"} on {versionName}
            </span>
            <span className="ne-ai-card-sub">Nautilus can propose changes that answer them.</span>
          </span>
          <button
            type="button"
            className="ne-ai-card-btn"
            onClick={() => {
              setTab("current");
              setPicking(true);
            }}
          >
            Address with AI
          </button>
        </section>
      ) : addressBlocked ? (
        <section className="ne-ai-card is-blocked" aria-label="Address comments with Nautilus">
          <span className="ne-ai-card-icon" aria-hidden="true">
            <IconSparkle size={18} />
          </span>
          <span className="ne-ai-card-text">
            <span className="ne-ai-card-title">No comments on {versionName} yet</span>
            <span className="ne-ai-card-sub" id={reasonId}>
              Nautilus can only address comments on the current version. Earlier ones are kept for reference.
            </span>
          </span>
          <button type="button" className="ne-ai-card-btn" disabled aria-describedby={reasonId}>
            Address with AI
          </button>
        </section>
      ) : null}

      {earlierComments.length && !picking ? (
        <div className="ne-comment-tabs" role="group" aria-label="Show comments on">
          <button
            type="button"
            className={`ne-comment-tab${showingEarlier ? "" : " is-active"}`}
            aria-pressed={!showingEarlier}
            onClick={() => setTab("current")}
          >
            {versionTab}
            <span className="ne-comment-tab-count" aria-label={`${currentComments.length} comments`}>
              {currentComments.length}
            </span>
          </button>
          <button
            type="button"
            className={`ne-comment-tab${showingEarlier ? " is-active" : ""}`}
            aria-pressed={showingEarlier}
            onClick={() => setTab("earlier")}
          >
            Earlier versions
            <span className="ne-comment-tab-count" aria-label={`${earlierComments.length} comments`}>
              {earlierComments.length}
            </span>
          </button>
        </div>
      ) : null}

      {comments?.length ? (
        <DiscussionSummary
          prdId={prd.id}
          comments={comments}
          currentVersionId={currentVersionId}
          onShowComments={showComments}
        />
      ) : null}

      {loadError ? (
        <p className="nw-error" role="alert">
          {loadError}
        </p>
      ) : comments === null ? (
        <p className="ne-card-note">Loading…</p>
      ) : comments.length ? (
        <div className="ne-comment-list" ref={list}>
          {showingEarlier ? (
            <p className="ne-comment-earlier-note">
              Left on earlier versions. Kept as the record of what was asked; Nautilus can’t address these.
            </p>
          ) : null}
          {shown.length ? (
            shown.map(renderComment)
          ) : (
            <p className="ne-comment-empty">
              No comments on {versionName} yet. New comments from reviewers show up here.
            </p>
          )}
        </div>
      ) : (
        <p className="ne-card-note">No comments yet. Leave the first one for your team.</p>
      )}

      {picking ? (
        <div className="ne-comment-form ne-ai-tray">
          <label className="nw-label" htmlFor={`${id}-ask`}>
            Anything to add? <span className="ne-ai-tray-optional">(optional)</span>
          </label>
          <textarea
            id={`${id}-ask`}
            className="ne-comment-box"
            rows={2}
            maxLength={MAX_INSTRUCTION}
            disabled={suggesting}
            placeholder="For example: keep the scope as it is."
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
          {suggestError ? (
            <p className="nw-error" role="alert">
              {suggestError}
            </p>
          ) : null}
          <div className={`ne-ai-tray-actions${onSuggestOptions ? "" : " is-single"}`}>
            {onSuggestOptions ? (
              <button
                type="button"
                className="nw-btn nw-btn-secondary"
                onClick={() => suggest(onSuggestOptions)}
                disabled={!picked.size || suggesting}
              >
                Show 2 options
              </button>
            ) : null}
            <button
              type="button"
              className="nw-btn nw-btn-primary"
              onClick={() => suggest(onSuggest)}
              disabled={!picked.size || suggesting}
            >
              {suggesting ? "Preparing…" : picked.size ? `Propose changes (${picked.size})` : "Propose changes"}
            </button>
          </div>
          <p className="ne-ai-tray-note">Uses one AI request. Nothing is saved until you accept.</p>
        </div>
      ) : (
      <form className="ne-comment-form ne-composer-form" onSubmit={post}>
        <label className="nw-sr" htmlFor={`${id}-box`}>
          Write a comment
        </label>
        <div className={`ne-composer${unsaved ? " is-disabled" : ""}`}>
        <textarea
          id={`${id}-box`}
          className="ne-comment-box ne-composer-box"
          rows={2}
          aria-describedby={`${id}-composer-hint`}
          maxLength={MAX_BODY}
          disabled={unsaved || posting}
          placeholder={unsaved ? "Save the PRD before commenting on it." : "Leave a comment for your team…"}
          value={draft}
          ref={box}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={suggestions.length ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            trackQuery(event.target);
          }}
          onSelect={(event) => trackQuery(event.target)}
          onKeyDown={onBoxKeyDown}
          onBlur={() => setQuery(null)}
        />
        {suggestions.length ? (
          <ul className="ne-mention-list" id={listId} role="listbox" aria-label="People to mention">
            {suggestions.map((person, index) => (
              <li
                key={person.user_id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`ne-mention-option${index === active ? " is-active" : ""}`}
                // mousedown, not click: a click would blur the box first and close the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(person);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <span className="ne-comment-avatar" aria-hidden="true">
                  {initialsOf(person.name) || "?"}
                </span>
                <span className="ne-mention-name">{person.name || person.email}</span>
                {person.role ? <span className="ne-mention-role">{person.role}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="ne-composer-bar">
          <button
            type="button"
            className="ne-composer-tool"
            aria-label="Mention someone"
            title="Mention someone"
            disabled={unsaved || posting || mentionedCount >= MAX_MENTIONS}
            // mousedown, not click: keeps the caret where it was in the box.
            onMouseDown={(event) => event.preventDefault()}
            onClick={startMention}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
            </svg>
          </button>
          <span className="ne-composer-hint" id={`${id}-composer-hint`}>
            {unsaved ? null : (
              <>
                On {versionName}
                <span className="ne-hide-sm"> · {SUBMIT_KEYS} + Enter to post</span>
              </>
            )}
          </span>
          {draft.length > MAX_BODY - 500 ? (
            <span className={`ne-composer-count${draft.length >= MAX_BODY ? " is-full" : ""}`}>
              {draft.length.toLocaleString()} / {MAX_BODY.toLocaleString()}
            </span>
          ) : null}
          <button
            type="submit"
            className="nw-btn nw-btn-primary ne-btn-34 ne-composer-send"
            disabled={unsaved || posting || !draft.trim()}
          >
            {posting ? "Posting…" : "Comment"}
          </button>
        </div>
        </div>
        {postError ? (
          <p className="nw-error" role="alert">
            {postError}
          </p>
        ) : null}
      </form>
      )}
    </section>
  );
}
