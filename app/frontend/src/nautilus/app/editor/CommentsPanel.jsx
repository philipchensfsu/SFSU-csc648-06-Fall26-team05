import { useEffect, useRef, useState } from "react";
import { api } from "../../../../lib/api";
import { PRD_SECTIONS } from "../questions";
import { formatDay, initialsOf } from "../format";

const SECTION_LABELS = Object.fromEntries(PRD_SECTIONS.map((section) => [section.id, section.label]));
const MAX_BODY = 5000;

// The backend's own sentences are written to be shown; only the two the
// panel can act on are reworded here.
function describeError(error) {
  if (error?.code === "no_saved_version") return "Save the PRD before commenting on it.";
  if (error?.code === "stale_version") return "Someone saved this PRD. Reload it, then post again.";
  return error?.message || "Couldn’t post your comment. Try again.";
}

// One comment. `body` is plain text from the API, so React escapes it and the
// CSS keeps its line breaks; it is never set as HTML.
function Comment({ comment, currentVersionId }) {
  const author = comment.author ?? {};
  const section = SECTION_LABELS[comment.section_type];
  // Older comments say which version they were left on, as the design's "v2".
  const olderVersion = currentVersionId && comment.version_id !== currentVersionId;
  return (
    <article className="ne-comment">
      <div className="ne-comment-head">
        <span className="ne-comment-avatar" aria-hidden="true">
          {initialsOf(author.name) || "?"}
        </span>
        <span className="ne-comment-who">{author.name || "Someone"}</span>
        {author.department ? <span className="ne-comment-dept">{author.department}</span> : null}
        <span className="ne-comment-when">{formatDay(comment.created_at)}</span>
      </div>
      {section || olderVersion ? (
        <div className="ne-comment-where">
          {section ?? "Whole PRD"}
          {olderVersion && comment.version_no ? <span className="ne-comment-ver">v{comment.version_no}</span> : null}
        </div>
      ) : null}
      <p className="ne-comment-body">{comment.body}</p>
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
//   onReload          reloads the PRD after a stale_version refusal
//   id, labelledBy, hidden   tab panel wiring from EditorPage
export default function CommentsPanel({ prd, currentVersionId, onReload, id, labelledBy, hidden }) {
  const [comments, setComments] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const mounted = useRef(true);
  const list = useRef(null);

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
      const comment = await api.addPrdComment(prd.id, { versionId: currentVersionId, body });
      if (!mounted.current) return;
      setComments((current) => [...(current ?? []), comment]);
      setDraft("");
    } catch (error) {
      if (!mounted.current) return;
      // What they typed is kept either way, so a reload doesn't lose it.
      setPostError(describeError(error));
      if (error?.code === "stale_version") onReload?.();
    } finally {
      if (mounted.current) setPosting(false);
    }
  }

  const unsaved = !currentVersionId;
  return (
    <section className="ne-card ne-comments" role="tabpanel" id={id} aria-labelledby={labelledBy} hidden={hidden}>
      <div className="ne-card-head">
        <h2 className="ne-card-title">Comments</h2>
        {comments?.length ? <span className="ne-card-count">{comments.length}</span> : null}
      </div>

      {loadError ? (
        <p className="nw-error" role="alert">
          {loadError}
        </p>
      ) : comments === null ? (
        <p className="ne-card-note">Loading…</p>
      ) : comments.length ? (
        <div className="ne-comment-list" ref={list}>
          {comments.map((comment) => (
            <Comment key={comment.id} comment={comment} currentVersionId={currentVersionId} />
          ))}
        </div>
      ) : (
        <p className="ne-card-note">No comments yet. Leave the first one for your team.</p>
      )}

      <form className="ne-comment-form" onSubmit={post}>
        <label className="nw-sr" htmlFor={`${id}-box`}>
          Write a comment
        </label>
        <textarea
          id={`${id}-box`}
          className="ne-comment-box"
          rows={3}
          maxLength={MAX_BODY}
          disabled={unsaved || posting}
          placeholder={unsaved ? "Save the PRD before commenting on it." : "Leave a comment for your team…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {postError ? (
          <p className="nw-error" role="alert">
            {postError}
          </p>
        ) : null}
        <div className="ne-comment-actions">
          <button
            type="submit"
            className="nw-btn nw-btn-primary ne-btn-34"
            disabled={unsaved || posting || !draft.trim()}
          >
            {posting ? "Posting…" : "Comment"}
          </button>
        </div>
      </form>
    </section>
  );
}
