import { useEffect, useId, useMemo, useRef, useState } from "react";
import "../workspace.css";
import "../flow/flow.css";
import "./editor.css";
import { FlowBar } from "../flow/FlowBar";
import { editedWhen, formatDate } from "../format";
import { IconPencil } from "../icons";
import { Alert, MenuButton, Modal, StatusChip } from "../ui";
import { IconBack, IconChat, IconCheck, IconDownload } from "./editorIcons";
import { exportMarkdown, exportPdf, exportWord } from "./exporters";
import { cleanHtml, isEmptyHtml } from "./html";
import { SectionEditor } from "./SectionEditor";

const TITLE_MAX = 200;
// Matches the backend's description limit (docs/prd-document-format.md).
const DESCRIPTION_MAX = 2000;

// Who sees the editing tools: `my_role` from the API (Decisions 1-3).
// Viewers get the read-only page and can still export.
const EDIT_ROLES = new Set(["owner", "editor", "org_admin"]);
const ROLE_LABELS = { owner: "Owner", editor: "Editor", viewer: "Viewer", org_admin: "Org admin" };

// What the page says when the API answers 409: someone (or another tab)
// saved this PRD after it was opened here.
const CONFLICT = {
  title: "This PRD changed since you opened it.",
  message: "Load the latest version to keep working. Unsaved edits here will be replaced.",
  conflict: true,
};

// --- the document --------------------------------------------------------

// The editor's copy of a PRD. Section HTML is cleaned on the way in, so
// nothing from the API reaches the page without passing the editor schema.
function toDoc(prd) {
  return {
    title: prd.title,
    description: prd.description ?? "",
    sections: (prd.sections ?? []).map((section) => ({
      id: section.id,
      title: section.title,
      html: cleanHtml(section.html),
    })),
  };
}

const sameDoc = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// DOMParser builds an inert document: nothing in it runs or loads.
function parse(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

// The text of each passage Nautilus marked as an assumption, in order.
const marksCache = new Map();
function assumptionsIn(html) {
  let found = marksCache.get(html);
  if (!found) {
    found = [...parse(html).querySelectorAll("mark.nt-assumption")].map((mark) =>
      mark.textContent.replace(/\s+/g, " ").trim(),
    );
    if (marksCache.size > 300) marksCache.clear();
    marksCache.set(html, found);
  }
  return found;
}

// The section with its `index`-th assumption confirmed: the highlight goes,
// the words stay.
function confirmIn(html, index) {
  const doc = parse(html);
  const mark = doc.querySelectorAll("mark.nt-assumption")[index];
  if (!mark) return html;
  mark.replaceWith(...mark.childNodes);
  return cleanHtml(doc.body.innerHTML);
}

const ID_CELL = /^[A-Z]{2,5}-\d{1,4}$/;
const PRIORITY_CELL = /^(must|should|could|won[’']?t)( have)?$/i;

// A section's HTML as the document shows it: each table in a frame that
// scrolls sideways on small screens, IDs (US-01, FR-01) in mono and
// priorities as chips. Display only: what is saved stays as written.
const displayCache = new Map();
function displayHtml(html) {
  const cached = displayCache.get(html);
  if (cached !== undefined) return cached;
  const doc = parse(html);
  doc.querySelectorAll("table").forEach((table) => {
    const frame = doc.createElement("div");
    frame.className = "ne-table";
    table.replaceWith(frame);
    frame.appendChild(table);
  });
  doc.querySelectorAll("td").forEach((cell) => {
    if (cell.children.length) return;
    const text = cell.textContent.trim();
    if (ID_CELL.test(text)) {
      cell.className = "ne-id";
    } else if (PRIORITY_CELL.test(text)) {
      const chip = doc.createElement("span");
      const level = text.toLowerCase().replace(/[^a-z]/g, "").replace(/have$/, "");
      chip.className = `ne-pri ne-pri-${level}`;
      chip.textContent = text;
      cell.replaceChildren(chip);
    }
  });
  const output = doc.body.innerHTML;
  if (displayCache.size > 300) displayCache.clear();
  displayCache.set(html, output);
  return output;
}

function scrollBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

// "Leave without saving?": keep editing, discard the changes, or save and go.
function LeaveDialog({ open, onStay, onDiscard, onSave }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title="Leave without saving?" busy={busy} onClose={onStay}>
      <p className="nw-modal-text">You have changes to this PRD that aren’t saved yet.</p>
      <div className="nw-modal-actions">
        <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={onStay} data-autofocus>
          Keep editing
        </button>
        <button type="button" className="nw-btn nw-btn-danger-outline" disabled={busy} onClick={onDiscard}>
          Discard changes
        </button>
        <button
          type="button"
          className="nw-btn nw-btn-primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            Promise.resolve(onSave()).finally(() => setBusy(false));
          }}
        >
          {busy ? "Saving…" : "Save and leave"}
        </button>
      </div>
    </Modal>
  );
}

// --- the editor --------------------------------------------------------------

// The PRD editor. Sections are edited one at a time (Edit, then Done) and
// saved together with Save, which sends the revision it started from so a
// newer save elsewhere is never overwritten (409). The owner edits; anyone
// else the API shows the PRD to (admins, engineers on final PRDs) reads and
// exports it.
function EditorPage({
  prd,
  exitLabel = "Back to dashboard",
  onSave,
  onReload,
  onOpenAnswers,
  onExit,
  onHome,
}) {
  const [doc, setDoc] = useState(() => toDoc(prd));
  const [saved, setSaved] = useState(() => toDoc(prd));
  // A section id, "details" (title and description), or null.
  const [editing, setEditing] = useState(null);
  const [sectionTouched, setSectionTouched] = useState(false);
  const [details, setDetails] = useState({ title: "", description: "" });
  const [detailsError, setDetailsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null); // { title, message, conflict }
  const [reloading, setReloading] = useState(false);
  // The navigation waiting on "Leave without saving?".
  const [leaving, setLeaving] = useState(null);
  const [currentId, setCurrentId] = useState(() => prd.sections?.[0]?.id ?? null);
  const editable = useRef(null);
  const docRef = useRef(null);
  const confirmHeading = useRef(null);
  const saveRef = useRef(null);
  // After a jump from the contents list, the section picked stays current
  // until the reader scrolls on their own.
  const pinned = useRef(false);
  // The edit box that just closed (a section id or "details"): focus goes
  // back to the Edit button that opened it.
  const returnFocus = useRef(null);
  const ids = useId();

  const [railTab, setRailTab] = useState("review");
  const canEdit = EDIT_ROLES.has(prd.myRole);
  const detailsChanged =
    editing === "details" && (details.title !== doc.title || details.description !== doc.description);
  const dirty = canEdit && (sectionTouched || detailsChanged || !sameDoc(doc, saved));

  const toConfirm = useMemo(
    () =>
      doc.sections.flatMap((section, sectionIndex) =>
        assumptionsIn(section.html).map((text, index) => ({ section, sectionIndex, index, text })),
      ),
    [doc.sections],
  );
  const emptyIds = useMemo(
    () => new Set(doc.sections.filter((section) => isEmptyHtml(section.html)).map((section) => section.id)),
    [doc.sections],
  );

  useEffect(() => {
    document.title = `Nautilus — ${doc.title}`;
  }, [doc.title]);

  useEffect(() => {
    const target = returnFocus.current;
    if (editing !== null || !target) return;
    returnFocus.current = null;
    const button =
      target === "details"
        ? document.getElementById(`${ids}-details-edit`)
        : document.querySelector(`#ne-sec-${target} .ne-edit-btn`);
    button?.focus({ preventScroll: true });
  }, [editing, ids]);

  // Closing or reloading the tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    function onBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // The contents list follows the section being read: the last one whose
  // top has passed 30% of the window.
  const firstId = doc.sections[0]?.id ?? null;
  const lastId = doc.sections[doc.sections.length - 1]?.id ?? null;
  useEffect(() => {
    let frame = 0;
    function update() {
      frame = 0;
      const root = docRef.current;
      if (!root || pinned.current) return;
      const line = window.innerHeight * 0.3;
      let current = firstId;
      root.querySelectorAll("[data-section]").forEach((element) => {
        if (element.getBoundingClientRect().top <= line) current = element.dataset.section;
      });
      const page = document.documentElement;
      if (page.scrollHeight > window.innerHeight + 2 && window.innerHeight + window.scrollY >= page.scrollHeight - 2) {
        current = lastId;
      }
      setCurrentId(current);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function unpin() {
      pinned.current = false;
    }
    const intents = ["wheel", "touchstart", "keydown", "mousedown"];
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    intents.forEach((type) => window.addEventListener(type, unpin, { passive: true }));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      intents.forEach((type) => window.removeEventListener(type, unpin, { passive: true }));
    };
  }, [firstId, lastId]);

  // --- editing ---------------------------------------------------------

  // Puts the open section's edits into the document and closes it.
  function applySection() {
    const editor = editable.current;
    if (!editor) {
      setEditing(null);
      return doc;
    }
    const html = cleanHtml(editor.getHtml());
    const next = {
      ...doc,
      sections: doc.sections.map((section) =>
        section.id === editing ? { ...section, html: isEmptyHtml(html) ? "<p></p>" : html } : section,
      ),
    };
    setDoc(next);
    setEditing(null);
    setSectionTouched(false);
    return next;
  }

  function applyDetails() {
    const title = details.title.trim();
    if (!title) {
      setDetailsError("PRD title is required.");
      return null;
    }
    const next = { ...doc, title, description: details.description.trim() };
    setDoc(next);
    setEditing(null);
    setDetailsError("");
    return next;
  }

  // Closes whatever is open, keeping its changes. Returns the document as
  // it then stands, or null while the title is empty.
  function closeEditing() {
    if (editing === "details") return applyDetails();
    if (editing) return applySection();
    return doc;
  }

  function cancelEditing() {
    setEditing(null);
    setSectionTouched(false);
    setDetailsError("");
  }

  // Done or Cancel in an edit box, with focus going back to its Edit button.
  function finishEditing(apply) {
    returnFocus.current = editing;
    if (apply) closeEditing();
    else cancelEditing();
  }

  function startEdit(id) {
    if (editing && closeEditing() === null) return;
    returnFocus.current = null;
    setEditing(id);
  }

  function startDetails() {
    if (editing && closeEditing() === null) return;
    returnFocus.current = null;
    setDetails({ title: doc.title, description: doc.description });
    setDetailsError("");
    setEditing("details");
  }

  function confirmAt(sectionId, index) {
    setDoc((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId ? { ...section, html: confirmIn(section.html, index) } : section,
      ),
    }));
    // The button goes away with the highlight; focus stays in the list.
    confirmHeading.current?.focus();
  }

  // --- saving and leaving ---------------------------------------------------

  async function save() {
    if (!canEdit || saving) return false;
    if (editing && document.activeElement?.closest(".ne-editbox, .ne-details")) returnFocus.current = editing;
    const next = closeEditing();
    if (next === null) return false;
    if (sameDoc(next, saved)) return true;
    setSaving(true);
    setProblem(null);
    try {
      await onSave(next);
      setSaved(next);
      return true;
    } catch (error) {
      setProblem(
        error?.status === 409
          ? CONFLICT
          : { title: "Couldn’t save.", message: error?.message || "Try again.", conflict: false },
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Ctrl+S / ⌘S saves instead of saving the web page.
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Runs `action` (leaving the editor) now, or after asking when there are
  // unsaved changes.
  function guard(action) {
    if (dirty) setLeaving(() => action);
    else action();
  }

  function reload() {
    setReloading(true);
    Promise.resolve(onReload()).catch((error) => {
      setReloading(false);
      setProblem({ title: "Couldn’t load the latest version.", message: error?.message || "Try again.", conflict: true });
    });
  }

  function openAnswers() {
    guard(() =>
      Promise.resolve(onOpenAnswers()).catch((error) =>
        setProblem({ title: "Couldn’t open the answers.", message: error?.message || "Try again.", conflict: false }),
      ),
    );
  }

  // --- moving around -------------------------------------------------------

  function jumpTo(id) {
    pinned.current = true;
    setCurrentId(id);
    document.getElementById(`ne-sec-${id}`)?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  }

  function jumpToMark(sectionId, index) {
    const mark = document.getElementById(`ne-sec-${sectionId}`)?.querySelectorAll("mark.nt-assumption")[index];
    if (!mark) return;
    mark.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    mark.classList.remove("is-flash");
    mark.getBoundingClientRect(); // restarts the animation
    mark.classList.add("is-flash");
    window.setTimeout(() => mark.classList.remove("is-flash"), 1600);
  }

  // --- render ----------------------------------------------------------------

  const exported = { title: saved.title, description: saved.description, sections: saved.sections };
  const exportItems = [
    { label: "Print or save as PDF", icon: <IconDownload />, onSelect: () => exportPdf(exported) },
    { label: "Word document (.doc)", icon: <IconDownload />, onSelect: () => exportWord(exported) },
    { label: "Markdown (.md)", icon: <IconDownload />, onSelect: () => exportMarkdown(exported) },
  ];
  let saveState = null;
  if (canEdit) {
    if (saving) saveState = ["is-saving", "Saving…", ""];
    else if (dirty) saveState = ["is-dirty", "Unsaved changes", `last saved ${editedWhen(prd.updatedAt)}`];
    else saveState = ["", "Saved", editedWhen(prd.updatedAt)];
  }

  return (
    <div className="nw-root nw-flow ne-editor">
      <FlowBar
        className="ne-bar"
        onHome={() => guard(onHome)}
        crumbs={[
          { label: "Dashboard", onClick: () => guard(onHome) },
          { label: doc.title },
          { label: "Editor", current: true },
        ]}
        // Status is shown, not set here: it changes only through the review
        // workflow (Decision 6).
        after={<StatusChip status={prd.status} />}
        actions={
          <>
            {saveState ? (
              <span className={`ne-savestate ${saveState[0]}`} role="status">
                <span className="ne-savestate-dot" aria-hidden="true" />
                {saveState[1]}
                {saveState[2] ? <span className="ne-hide-sm"> · {saveState[2]}</span> : null}
              </span>
            ) : (
              <span className="ne-viewonly">View only</span>
            )}
            <MenuButton
              label="Export"
              className="nw-btn nw-btn-secondary ne-btn-38"
              heading={dirty ? "Exports the last saved version" : "Download this PRD"}
              items={exportItems}
            >
              <IconDownload />
              Export
            </MenuButton>
            {canEdit ? (
              <button type="button" className="nw-btn nw-btn-primary ne-btn-38" onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </button>
            ) : null}
          </>
        }
      />

      {problem ? (
        <div className="ne-alerts">
          <Alert onDismiss={() => setProblem(null)}>
            <strong>{problem.title}</strong> {problem.message}
            {problem.conflict ? (
              <>
                {" "}
                <button type="button" className="ne-alert-action" onClick={reload} disabled={reloading}>
                  {reloading ? "Loading…" : "Load the latest version"}
                </button>
              </>
            ) : null}
          </Alert>
        </div>
      ) : null}

      <div className="ne-body">
        <nav aria-label="PRD sections" className="ne-outline">
          <button type="button" className="ne-outline-link" onClick={() => guard(onExit)}>
            <IconBack />
            {exitLabel}
          </button>
          <div className="ne-outline-label" aria-hidden="true">
            Contents
          </div>
          <ol className="ne-outline-list">
            {doc.sections.map((section, index) => {
              const count = assumptionsIn(section.html).length;
              const current = currentId === section.id;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`ne-outline-item${current ? " is-current" : ""}`}
                    aria-current={current ? "location" : undefined}
                    onClick={() => jumpTo(section.id)}
                  >
                    <span className="ne-outline-num" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="ne-outline-name">{section.title}</span>
                    {count ? (
                      <span className="ne-outline-flag">
                        {count}
                        <span className="nw-sr"> {count === 1 ? "assumption" : "assumptions"} to confirm</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
          {canEdit ? (
            <button type="button" className="ne-outline-answers" onClick={openAnswers}>
              <IconChat />
              Discovery answers
            </button>
          ) : null}
        </nav>

        <main className="ne-main">
          <article className="ne-doc" ref={docRef}>
            <header className="ne-doc-head">
              <div className="ne-kicker-row">
                <div className="ne-kicker">Product requirements document</div>
                {canEdit && editing !== "details" ? (
                  <button
                    type="button"
                    id={`${ids}-details-edit`}
                    className="ne-edit-btn"
                    aria-label="Edit title and description"
                    onClick={startDetails}
                  >
                    <IconPencil size={15} />
                    Edit
                  </button>
                ) : null}
              </div>
              {editing === "details" ? (
                <div className="ne-details">
                  <div className="nf-field">
                    <label className="nf-label" htmlFor={`${ids}-title`}>
                      Title
                    </label>
                    <input
                      id={`${ids}-title`}
                      className="nf-input"
                      value={details.title}
                      maxLength={TITLE_MAX}
                      autoComplete="off"
                      autoFocus
                      aria-invalid={detailsError ? true : undefined}
                      aria-describedby={detailsError ? `${ids}-title-error` : undefined}
                      onChange={(event) => {
                        setDetails((current) => ({ ...current, title: event.target.value }));
                        setDetailsError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          finishEditing(true);
                        }
                      }}
                    />
                    {detailsError ? (
                      <span id={`${ids}-title-error`} className="nf-field-error">
                        {detailsError}
                      </span>
                    ) : null}
                  </div>
                  <div className="nf-field">
                    <div className="nf-label-row">
                      <label className="nf-label" htmlFor={`${ids}-description`}>
                        Short description <span className="nf-label-note">· optional</span>
                      </label>
                      <span className="nf-count" aria-hidden="true">
                        {details.description.length} / {DESCRIPTION_MAX}
                      </span>
                    </div>
                    <textarea
                      id={`${ids}-description`}
                      className="nf-textarea"
                      rows={2}
                      maxLength={DESCRIPTION_MAX}
                      value={details.description}
                      onChange={(event) =>
                        setDetails((current) => ({
                          ...current,
                          description: event.target.value.replace(/\s*\n\s*/g, " "),
                        }))
                      }
                    />
                  </div>
                  <div className="ne-edit-actions">
                    <button type="button" className="nw-btn nw-btn-secondary ne-btn-34" onClick={() => finishEditing(false)}>
                      Cancel
                    </button>
                    <button type="button" className="nw-btn ne-btn-ink ne-btn-34" onClick={() => finishEditing(true)}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="ne-title">{doc.title}</h1>
                  {doc.description ? <p className="ne-lede">{doc.description}</p> : null}
                </>
              )}
              <dl className="ne-meta">
                {ROLE_LABELS[prd.myRole] ? (
                  <div>
                    <dt>Your access</dt>
                    <dd>{ROLE_LABELS[prd.myRole]}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(prd.updatedAt)}</dd>
                </div>
                {prd.createdAt ? (
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(prd.createdAt)}</dd>
                  </div>
                ) : null}
              </dl>
              {canEdit ? null : (
                <p className="ne-readonly-note">You can read and export this PRD. Ask its owner for edit access to change it.</p>
              )}
            </header>

            {doc.sections.map((section, index) => {
              const headingId = `${ids}-h-${section.id}`;
              const isEditing = editing === section.id;
              let body;
              if (isEditing) {
                body = (
                  <SectionEditor
                    ref={editable}
                    html={section.html}
                    labelledBy={headingId}
                    onTouch={() => setSectionTouched(true)}
                    onDone={() => finishEditing(true)}
                    onCancel={() => finishEditing(false)}
                  />
                );
              } else if (emptyIds.has(section.id)) {
                body = (
                  <div className="ne-empty">
                    <span>Nothing here yet.</span>
                    {canEdit ? (
                      <button type="button" className="ne-link-btn" onClick={() => startEdit(section.id)}>
                        Write this section
                      </button>
                    ) : null}
                  </div>
                );
              } else {
                body = <div className="ne-content" dangerouslySetInnerHTML={{ __html: displayHtml(section.html) }} />;
              }
              return (
                <section
                  key={section.id}
                  id={`ne-sec-${section.id}`}
                  data-section={section.id}
                  className="ne-section"
                  aria-labelledby={headingId}
                >
                  <div className="ne-section-head">
                    <span className="ne-section-num" aria-hidden="true">
                      §{index + 1}
                    </span>
                    <h2 id={headingId} className="ne-section-title">
                      {section.title}
                    </h2>
                    {isEditing ? <span className="ne-editing-tag">Editing</span> : null}
                    {canEdit && !isEditing ? (
                      <button
                        type="button"
                        className="ne-edit-btn"
                        aria-label={`Edit ${section.title}`}
                        onClick={() => startEdit(section.id)}
                      >
                        <IconPencil size={15} />
                        Edit
                      </button>
                    ) : null}
                  </div>
                  {body}
                </section>
              );
            })}
          </article>
        </main>

        <aside className="ne-rail" aria-label="Review and AI">
          <div className="ne-rail-tabs" role="tablist" aria-label="Side panel">
            <button
              type="button"
              role="tab"
              id={`${ids}-tab-review`}
              aria-selected={railTab === "review"}
              aria-controls={`${ids}-panel-review`}
              className={`ne-rail-tab${railTab === "review" ? " is-active" : ""}`}
              onClick={() => setRailTab("review")}
            >
              Review
              {toConfirm.length ? <span className="ne-rail-tab-count">{toConfirm.length}</span> : null}
            </button>
            <button
              type="button"
              role="tab"
              id={`${ids}-tab-ai`}
              aria-selected={railTab === "ai"}
              aria-controls={`${ids}-panel-ai`}
              className={`ne-rail-tab${railTab === "ai" ? " is-active" : ""}`}
              onClick={() => setRailTab("ai")}
            >
              Ask AI
            </button>
          </div>

          {railTab === "ai" ? (
            // The real chat (POST /api/prds/{id}/ai/chat, #75/#80) moves here
            // once it merges.
            <section
              className="ne-card"
              role="tabpanel"
              id={`${ids}-panel-ai`}
              aria-labelledby={`${ids}-tab-ai`}
            >
              <div className="ne-card-head">
                <h2 className="ne-card-title">Ask Nautilus about this PRD</h2>
              </div>
              <p className="ne-card-note">
                Questions about this PRD will be answered here. The AI assistant isn’t connected yet.
              </p>
            </section>
          ) : (
          <div role="tabpanel" id={`${ids}-panel-review`} aria-labelledby={`${ids}-tab-review`}>
          <section className="ne-card" aria-labelledby={`${ids}-confirm`}>
            <div className="ne-card-head">
              <h2 id={`${ids}-confirm`} ref={confirmHeading} tabIndex={-1} className="ne-card-title">
                Assumptions to confirm
              </h2>
              <span className={`ne-card-count${toConfirm.length ? "" : " is-zero"}`}>{toConfirm.length}</span>
            </div>
            {toConfirm.length ? (
              <>
                <p className="ne-card-note">
                  Highlighted text is something Nautilus had to assume. Check each one, then confirm it or edit the
                  section.
                </p>
                <ol className="ne-assume-list">
                  {toConfirm.map((item) => (
                    <li key={`${item.section.id}-${item.index}`} className="ne-assume">
                      <button
                        type="button"
                        className="ne-assume-jump"
                        onClick={() => jumpToMark(item.section.id, item.index)}
                      >
                        <span className="ne-assume-where">
                          §{item.sectionIndex + 1} {item.section.title}
                        </span>
                        <span className="ne-assume-text">{item.text}</span>
                      </button>
                      {canEdit && editing !== item.section.id ? (
                        <button
                          type="button"
                          className="ne-assume-ok"
                          aria-label={`Confirm assumption: ${item.text}`}
                          onClick={() => confirmAt(item.section.id, item.index)}
                        >
                          <IconCheck size={14} />
                          Confirm
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="ne-card-note">Nothing to confirm. Anything Nautilus has to assume is highlighted here.</p>
            )}
          </section>

          {emptyIds.size ? (
            <section className="ne-card" aria-labelledby={`${ids}-empty`}>
              <div className="ne-card-head">
                <h2 id={`${ids}-empty`} className="ne-card-title">
                  Still empty
                </h2>
                <span className="ne-card-count is-zero">{emptyIds.size}</span>
              </div>
              <ul className="ne-empty-list">
                {doc.sections.map((section, index) =>
                  emptyIds.has(section.id) ? (
                    <li key={section.id}>
                      <button
                        type="button"
                        className="ne-empty-item"
                        onClick={() => {
                          jumpTo(section.id);
                          if (canEdit) startEdit(section.id);
                        }}
                      >
                        <span className="ne-outline-num" aria-hidden="true">
                          §{index + 1}
                        </span>
                        {section.title}
                      </button>
                    </li>
                  ) : null,
                )}
              </ul>
            </section>
          ) : null}
          </div>
          )}
        </aside>
      </div>

      <LeaveDialog
        open={leaving !== null}
        onStay={() => setLeaving(null)}
        onDiscard={() => {
          const action = leaving;
          setLeaving(null);
          action();
        }}
        onSave={async () => {
          const action = leaving;
          const ok = await save();
          setLeaving(null);
          if (ok) action();
        }}
      />
    </div>
  );
}

export default EditorPage;
