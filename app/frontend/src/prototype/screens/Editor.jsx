import { useEffect, useRef, useState } from "react";
import Dialog from "../Dialog";
import { formatDate, STATUS_LABELS } from "../data";
import { api } from "../../../lib/api";

const sectionNumber = (index) => `§${String(index + 1).padStart(2, "0")}`;

// The backend accepts 20; sending fewer keeps the prompt small and the
// follow-up context recent.
const MAX_CHAT_HISTORY = 20;

// The AI limits are the ones worth wording ourselves; everything else shows
// the backend's own sentence, which is written to be shown as-is.
function describeChatError(error) {
  const wait = Number(error?.retryAfter);
  const inAMoment = Number.isFinite(wait) && wait > 0 ? ` Try again in ${Math.ceil(wait)}s.` : "";
  if (error?.code === "ai_cooldown") return `Just a moment between questions.${inAMoment}`;
  if (error?.code === "ai_busy") return `Nautilus is still working on your last question.${inAMoment}`;
  if (error?.code === "stale_revision") {
    return "This PRD changed since you opened it. Refresh to carry on chatting.";
  }
  return error?.message || "Couldn't reach Nautilus. Try again.";
}

function buildDocumentHtml(sections) {
  return sections
    .map(
      (section, index) =>
        `<section id="sec-${section.id}" data-id="${section.id}">` +
        `<h2 contenteditable="false">${sectionNumber(index)} ${section.title}</h2>` +
        `<div class="nt-section-body">${section.html}</div>` +
        `</section>`,
    )
    .join("");
}

function countAssumptions(root) {
  const counts = {};
  root.querySelectorAll("section[data-id]").forEach((section) => {
    counts[section.dataset.id] = section.querySelectorAll(".nt-assumption").length;
  });
  return counts;
}

// Stand-ins for the real AI calls.
const AI_ACTIONS = {
  Rewrite: (text) =>
    `${text.replace(/\.$/, "")}, which is the core issue this product addresses.`,
  Expand: (text) =>
    `${text} This matters because it shapes how students experience the product every week, and it is the main reason they would return.`,
  Shorten: (text) => text.split(/(?<=\.)\s/)[0],
  Improve: (text) => text.replace(/\bstruggle to\b/g, "find it hard to").replace(/\bMany\b/g, "Most"),
};

const TOOLS = [
  { label: "Undo", name: "undo" },
  { label: "Redo", name: "redo" },
  { label: "Heading", name: "formatBlock", value: "h3" },
  { label: "Text", name: "formatBlock", value: "p" },
  { label: "B", name: "bold", aria: "Bold" },
  { label: "I", name: "italic", aria: "Italic" },
  { label: "U", name: "underline", aria: "Underline" },
  { label: "Bullets", name: "insertUnorderedList" },
  { label: "Numbered", name: "insertOrderedList" },
];

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function Editor({ prd, onSave, onDashboard, onExport }) {
  const docRef = useRef(null);
  const savedRange = useRef(null);
  const assumptionCursor = useRef(-1);
  const [initialHtml] = useState(() => buildDocumentHtml(prd.sections));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showAi, setShowAi] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [assumptions, setAssumptions] = useState({});
  const [scope, setScope] = useState({ text: "", sectionId: prd.sections[0].id });
  const [chat, setChat] = useState([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState(null);
  // Which PRD the open conversation belongs to, so a reply that arrives after
  // the user switches PRDs is dropped instead of appearing in the new chat.
  const openPrdId = useRef(prd.id);

  useEffect(() => {
    if (openPrdId.current === prd.id) return;
    openPrdId.current = prd.id;
    setChat([]);
    setQuestion("");
    setAsking(false);
    setChatError(null);
  }, [prd.id]);

  const totalAssumptions = Object.values(assumptions).reduce((a, b) => a + b, 0);

  useEffect(() => {
    setAssumptions(countAssumptions(docRef.current));
  }, []);

  useEffect(() => {
    function handleSelection() {
      const selection = document.getSelection();
      if (!selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!docRef.current?.contains(range.commonAncestorContainer)) return;
      savedRange.current = range.cloneRange();
      const node =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? range.startContainer
          : range.startContainer.parentElement;
      setScope({
        text: selection.toString().trim(),
        sectionId: node.closest("section[data-id]")?.dataset.id ?? prd.sections[0].id,
      });
    }
    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, [prd.sections]);

  function restoreSelection() {
    docRef.current.focus();
    if (!savedRange.current) return false;
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange.current);
    return true;
  }

  function command(name, value) {
    restoreSelection();
    document.execCommand(name, false, value);
    handleInput();
  }

  function handleInput() {
    setDirty(true);
    setAssumptions(countAssumptions(docRef.current));
  }

  function handleSave() {
    const root = docRef.current;
    root.querySelectorAll("mark.nt-ai-edit").forEach((mark) => {
      mark.replaceWith(...mark.childNodes);
    });
    const sections = prd.sections.map((section) => ({
      ...section,
      html: root.querySelector(`section[data-id="${section.id}"] .nt-section-body`)
        ?.innerHTML ?? section.html,
      assumptions: assumptions[section.id] ?? 0,
    }));
    setSaving(true);
    setSaveError(null);
    // onSave is a real network request now (PUT /api/prds/:id), not a
    // synchronous local update, so wait for it before clearing `dirty` --
    // otherwise a failed save would still show as "saved".
    Promise.resolve(onSave(sections))
      .then(() => setDirty(false))
      .catch((error) =>
        setSaveError(
          error.message || "Couldn't save your changes. Try again.",
        ),
      )
      .finally(() => setSaving(false));
  }

  function reviewNextAssumption() {
    const marks = [...docRef.current.querySelectorAll(".nt-assumption")];
    if (!marks.length) return;
    assumptionCursor.current = (assumptionCursor.current + 1) % marks.length;
    const mark = marks[assumptionCursor.current];
    mark.scrollIntoView({ behavior: "smooth", block: "center" });
    const range = document.createRange();
    range.selectNodeContents(mark);
    docRef.current.focus();
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function selectSection() {
    const body = docRef.current.querySelector(
      `section[data-id="${scope.sectionId}"] .nt-section-body`,
    );
    const range = document.createRange();
    range.selectNodeContents(body);
    docRef.current.focus();
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function runAiAction(action) {
    if (!restoreSelection()) {
      selectSection();
    }
    const selection = document.getSelection();
    let range = selection.getRangeAt(0);

    if (action === "Insert content") {
      const block = closestBlock(range.endContainer);
      range = document.createRange();
      range.setStartAfter(block);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand(
        "insertHTML",
        false,
        `<p><mark class="nt-ai-edit">New content drafted by the AI assistant for this section.</mark></p>`,
      );
    } else {
      if (range.collapsed) {
        range = document.createRange();
        range.selectNodeContents(closestBlock(selection.anchorNode));
        selection.removeAllRanges();
        selection.addRange(range);
      }
      const original = selection.toString().trim();
      const updated = AI_ACTIONS[action](original);
      document.execCommand(
        "insertHTML",
        false,
        `<mark class="nt-ai-edit">${escapeHtml(updated)}</mark>`,
      );
    }
    handleInput();
    const sectionIndex = prd.sections.findIndex((s) => s.id === scope.sectionId);
    setChat((log) => [
      ...log,
      { from: "you", text: action },
      {
        from: "ai",
        text: `Done. I edited ${sectionNumber(sectionIndex)} ${prd.sections[sectionIndex].title}. The change is highlighted until you save.`,
      },
    ]);
  }

  async function askAi(event) {
    event.preventDefault();
    const asked = question.trim();
    // One request at a time: the backend allows one per user, and a second
    // send would only come back ai_busy.
    if (!asked || asking) return;

    const forPrd = prd.id;
    // What the backend may see: this PRD's recent turns, nothing else.
    const history = chat
      .filter((message) => message.kind !== "error")
      .slice(-MAX_CHAT_HISTORY)
      .map((message) => ({
        role: message.from === "ai" ? "assistant" : "user",
        content: message.text,
      }));

    setChat((log) => [...log, { from: "you", text: asked }]);
    setQuestion("");
    setAsking(true);
    setChatError(null);

    try {
      const reply = await api.chatAboutPrd(forPrd, {
        revision: prd.revision,
        message: asked,
        history,
      });
      // A reply that arrives after the user moved to another PRD belongs to
      // the old conversation; drop it rather than show it under the new one.
      if (openPrdId.current !== forPrd) return;
      setChat((log) => [...log, { from: "ai", kind: reply.kind, text: reply.message }]);
    } catch (error) {
      if (openPrdId.current !== forPrd) return;
      // Keep what they typed so they can send it again.
      setQuestion(asked);
      setChat((log) => log.slice(0, -1));
      setChatError(describeChatError(error));
    } finally {
      if (openPrdId.current === forPrd) setAsking(false);
    }
  }

  const scopeSection = prd.sections.find((s) => s.id === scope.sectionId);

  return (
    <div className="nt-editor">
      <div className="nt-editor-bar">
        <div className="nt-editor-title">
          <span
            className={`nt-status nt-status-${saving ? "unsaved" : dirty ? "unsaved" : prd.status}`}
          >
            {saving
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : (STATUS_LABELS[prd.status] ?? prd.status)}
          </span>
          <strong>{prd.title}</strong>
          {saveError ? (
            <span className="nt-error" role="alert">
              {saveError}
            </span>
          ) : null}
        </div>
        <div className="nt-actions">
          <button type="button" className="nt-btn nt-btn-ghost" onClick={onDashboard}>
            Dashboard
          </button>
          <button type="button" className="nt-btn nt-btn-ghost" onClick={onExport}>
            Export
          </button>
          <button
            type="button"
            className="nt-btn nt-btn-ghost"
            onClick={() => setShowHistory(true)}
          >
            Version history
          </button>
          <button
            type="button"
            className="nt-btn nt-btn-ghost"
            aria-pressed={showAi}
            onClick={() => setShowAi((value) => !value)}
          >
            AI assistant
          </button>
          <button
            type="button"
            className="nt-btn nt-btn-primary"
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className={`nt-editor-body${showAi ? "" : " no-ai"}`}>
        <nav className="nt-outline" aria-label="Outline">
          <p className="nt-sidebar-heading">Outline</p>
          {totalAssumptions > 0 ? (
            <div className="nt-assumption-box">
              <p>
                {totalAssumptions} assumption{totalAssumptions === 1 ? "" : "s"} to
                review
              </p>
              <button
                type="button"
                className="nt-btn nt-btn-secondary nt-btn-sm"
                onClick={reviewNextAssumption}
              >
                Review next assumption
              </button>
            </div>
          ) : (
            <p className="nt-muted nt-small">No assumptions left to review.</p>
          )}
          <ol>
            {prd.sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#sec-${section.id}`}>
                  {sectionNumber(index)} {section.title}
                </a>
                {assumptions[section.id] ? (
                  <span className="nt-tag nt-tag-warn">
                    {assumptions[section.id]} assumption
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </nav>

        <main className="nt-doc-wrap">
          <div className="nt-toolbar" role="toolbar" aria-label="Formatting">
            {TOOLS.map(({ label, name, value, aria }) => (
              <button
                key={label}
                type="button"
                className="nt-tool"
                aria-label={aria}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => command(name, value)}
              >
                {label}
              </button>
            ))}
          </div>
          <article className="nt-card nt-doc">
            <h1>{prd.title}</h1>
            <p className="nt-muted nt-small">
              v1 · Generated {formatDate(prd.modified)}
            </p>
            <div
              ref={docRef}
              className="nt-doc-content"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="PRD content"
              onInput={handleInput}
              dangerouslySetInnerHTML={{ __html: initialHtml }}
            />
          </article>
        </main>

        {showAi ? (
          <aside className="nt-ai" aria-label="AI assistant">
            <div className="nt-ai-head">
              <h2>AI assistant</h2>
              <button
                type="button"
                className="nt-btn nt-btn-ghost nt-btn-sm"
                onClick={() => setShowAi(false)}
              >
                Hide
              </button>
            </div>
            <p className="nt-sidebar-heading">Scope</p>
            <p className="nt-small nt-ai-scope">
              {scope.text
                ? `Selected: “${scope.text.slice(0, 80)}${scope.text.length > 80 ? "…" : ""}”`
                : `No selection. AI uses the paragraph at your cursor in ${scopeSection?.title}.`}
            </p>
            <button
              type="button"
              className="nt-btn nt-btn-secondary nt-btn-sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={selectSection}
            >
              Select this section
            </button>
            <div className="nt-ai-actions">
              {[...Object.keys(AI_ACTIONS), "Insert content"].map((action) => (
                <button
                  key={action}
                  type="button"
                  className="nt-chip"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runAiAction(action)}
                >
                  {action}
                </button>
              ))}
            </div>
            <p className="nt-small nt-muted">
              This chat is temporary and resets when you leave. Your saved PRD is
              kept. AI-edited text is highlighted until you save.
            </p>
            <ol className="nt-ai-log" aria-live="polite">
              {chat.map((message, index) => (
                <li key={index} className={`nt-bubble nt-bubble-${message.from === "ai" ? "ai" : "user"}`}>
                  {message.text}
                </li>
              ))}
              {asking ? (
                <li className="nt-bubble nt-bubble-ai nt-muted">Thinking…</li>
              ) : null}
            </ol>
            {chatError ? (
              <p className="nt-small nt-error" role="alert">
                {chatError}
              </p>
            ) : null}
            <form className="nt-ai-form" onSubmit={askAi}>
              <label htmlFor="ask-ai" className="nt-sr-only">
                Ask Nautilus about this PRD
              </label>
              <textarea
                id="ask-ai"
                rows={2}
                placeholder="Ask Nautilus about this PRD..."
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <button
                type="submit"
                className="nt-btn nt-btn-primary nt-btn-sm"
                disabled={asking || !question.trim()}
              >
                {asking ? "Sending…" : "Send"}
              </button>
            </form>
          </aside>
        ) : null}
      </div>

      <Dialog open={showHistory} title="Version history" onClose={() => setShowHistory(false)}>
        <ul className="nt-history">
          <li>
            <strong>v1 · {STATUS_LABELS[prd.status] ?? prd.status}</strong>
            <span className="nt-muted">{formatDate(prd.modified)}</span>
          </li>
          <li>
            <strong>v0 · Interview answers</strong>
            <span className="nt-muted">Before generation</span>
          </li>
        </ul>
        <p className="nt-small nt-muted">Restoring versions isn&apos;t in the prototype.</p>
        <div className="nt-dialog-actions">
          <button
            type="button"
            className="nt-btn nt-btn-secondary"
            onClick={() => setShowHistory(false)}
          >
            Close
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function closestBlock(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return (
    element.closest("p, li, h3, .nt-section-body") ?? element
  );
}

export default Editor;
