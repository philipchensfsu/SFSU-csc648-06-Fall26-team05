import { useEffect, useId, useMemo, useRef, useState } from "react";
import "../workspace.css";
import "../flow/flow.css";
import "./editor.css";
import { FlowBar } from "../flow/FlowBar";
import AskAiPanel from "./AskAiPanel";
import CommentsPanel from "./CommentsPanel";
import { isDraftOutOfDate } from "./aiDraft";
import PrdProposalComparison from "./PrdProposalComparison";
import { describeProposalError, mustAskAgain, needsReapproval, sessionMessagesFrom } from "./proposal";
import { ReapprovalDialog } from "./ReapprovalDialog";
import { ApprovalsCard, YourReviewCard } from "./ReviewPanel";
import { SubmitReviewDialog } from "./SubmitReviewDialog";
import { approvalProgress, editedWhen, formatDate } from "../format";
import { IconPencil, IconPeople } from "../icons";
import { Alert, MenuButton, Modal, StatusChip } from "../ui";
import { IconBack, IconChat, IconCheck, IconDownload } from "./editorIcons";
import { exportMarkdown, exportPdf, exportWord } from "./exporters";
import { cleanHtml, isEmptyHtml, sectionsToDocument } from "./html";
import { SectionEditor } from "./SectionEditor";
import { ShareDialog } from "./ShareDialog";

const TITLE_MAX = 200;
// Matches the backend's description limit (docs/prd-document-format.md).
const DESCRIPTION_MAX = 2000;

const ROLE_LABELS = { owner: "Owner", editor: "Editor", viewer: "Viewer", org_admin: "Org admin" };

// What the page says when the API answers 409: someone (or another tab)
// saved this PRD after it was opened here.
const CONFLICT = {
  title: "This PRD changed since you opened it.",
  message: "Load the latest version to keep working. Unsaved edits here will be replaced.",
  conflict: true,
};

// `reapproving` normally holds the document the server refused, to send
// again. Accepting an AI draft has no such document, so it holds this
// instead and the draft is accepted again with the reviewers confirmed.
const DRAFT_REAPPROVAL = "ai-draft";
// The same for accepting a proposal from the chat (conversational editing).
const PROPOSAL_REAPPROVAL = "ai-proposal";

// A review is tied to one saved version, so these mean the page is out of date.
const STALE_REVIEW_CODES = new Set(["stale_revision", "stale_version", "round_not_current"]);

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

// Leaving an AI draft loses it, since nothing has been saved.
function LeaveDraftDialog({ open, onStay, onDiscard, proposal = false }) {
  return (
    <Modal open={open} title={proposal ? "Discard these changes?" : "Discard this draft?"} onClose={onStay}>
      <p className="nw-modal-text">
        {proposal
          ? "The proposed changes aren’t saved. If you leave, you can propose them again from the chat."
          : "This AI draft isn’t saved. If you leave, you’ll need to generate it again."}
      </p>
      <div className="nw-modal-actions">
        <button type="button" className="nw-btn nw-btn-secondary" onClick={onStay} data-autofocus>
          Keep reviewing
        </button>
        <button type="button" className="nw-btn nw-btn-danger-outline" onClick={onDiscard}>
          {proposal ? "Discard changes" : "Discard draft"}
        </button>
      </div>
    </Modal>
  );
}

// --- the editor --------------------------------------------------------------

// The PRD editor. Sections are edited one at a time (Edit, then Done) and
// saved together with Save, which sends the revision it started from so a
// newer save elsewhere is never overwritten (409). `detail.capabilities` says
// who edits; anyone else the API shows the PRD to reads and exports it. The
// page stays read-only until `detail` arrives.
//
// With `aiDraft` ({ onAccept, onDiscard, onRegenerate }) it previews an unsaved
// AI draft instead: read-only, with `detail` null, until it's accepted.
//
// Conversational editing: `chat` / `setChat` hold the Ask AI conversation
// (kept by Prototype, so it outlives this page). For people who can ask the
// AI for changes, "Propose changes" calls `onRequestProposal(instruction,
// sessionMessages)`; for owners, the Comments tab's "Ask AI to address" calls
// `onRequestFeedbackProposal(commentIds, instruction)` (review suggestions).
// While `proposal` is set, the page shows the saved PRD
// beside it instead of the editor; `onAcceptProposal(confirmedReviewerIds?)`
// saves it and `onDiscardProposal()` drops it. `onAdjustProposal(instruction,
// sessionMessages)` asks for changes to it first (Request adjustments).
function EditorPage({
  prd,
  detail,
  onRetryDetail,
  // The PRD's owners, when `detail` isn't loaded (the AI preview).
  owners = [],
  organizationId,
  userId,
  exitLabel = "Back to dashboard",
  onSave,
  aiDraft = null,
  chat,
  setChat,
  proposal = null,
  onRequestProposal,
  onRequestFeedbackProposal,
  onAcceptProposal,
  onDiscardProposal,
  onAdjustProposal,
  onSubmitReview,
  onDecideReview,
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
  const [accepting, setAccepting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewChoice, setReviewChoice] = useState(null);
  // The edits an approved PRD refused, waiting on "Your edits need new approval".
  const [reapproving, setReapproving] = useState(null);
  // Split view: the chat beside the document instead of in the side panel.
  const [split, setSplit] = useState(false);
  // Conversational editing: asking for a proposal, and what went wrong.
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState(null);
  const [proposalProblem, setProposalProblem] = useState(null); // { message, askAgain }
  const [adjusting, setAdjusting] = useState(false);
  // Goes up when the header's Approve or Request changes is pressed.
  const [reviewJump, setReviewJump] = useState(0);
  const reviewCard = useRef(null);
  const canEdit = detail?.capabilities?.can_edit === true;
  const canShare = detail?.capabilities?.can_assign === true;
  const canSubmitReview = detail?.capabilities?.can_submit_review === true;
  const canApprove = detail?.capabilities?.can_approve === true;
  // The backend's own rule for asking the AI to change this PRD (owners only
  // once it's approved); it refuses anyone else before using any AI quota.
  const canPropose = !aiDraft && Boolean(onRequestProposal) && detail?.capabilities?.can_request_ai === true;
  // Revisions from review comments are owners-only (E12), with comments on
  // the current version; the backend's flag says so.
  const canSuggest =
    !aiDraft &&
    Boolean(onRequestFeedbackProposal) &&
    detail?.capabilities?.can_request_review_suggestions === true;
  // Nothing says "View only" until the API has actually said so.
  const viewOnly = Boolean(detail?.capabilities) && !canEdit;
  const progress = approvalProgress(detail?.approval);
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
  const unsaved = dirty || Boolean(aiDraft) || Boolean(proposal);
  useEffect(() => {
    if (!unsaved) return undefined;
    function onBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);

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
      await onSave({ ...next, contentJson: sectionsToDocument(next.sections) });
      setSaved(next);
      return true;
    } catch (error) {
      // Nothing was saved and the edits stay: the owner confirms reviewers next.
      if (error?.code === "reapproval_required") {
        setReapproving(next);
        return false;
      }
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

  // --- reviews -------------------------------------------------------------

  // Sends the refused save again with the confirmed reviewers.
  async function applyReapproval(reviewerIds) {
    if (reapproving === PROPOSAL_REAPPROVAL) {
      try {
        await onAcceptProposal(reviewerIds);
        setReapproving(null);
      } catch (error) {
        setReapproving(null);
        setProposalProblem({ message: describeProposalError(error), askAgain: mustAskAgain(error) });
      }
      return;
    }
    // The AI draft is accepted again with the reviewers confirmed; Prototype
    // sends them with the save that the server refused.
    if (reapproving === DRAFT_REAPPROVAL) {
      try {
        await aiDraft.onAccept(reviewerIds);
        setReapproving(null);
      } catch (error) {
        setReapproving(null);
        setAccepting(false);
        setProblem({
          title: "Couldn’t accept this draft.",
          message: error?.message || "Try again.",
          conflict: error?.status === 409,
        });
      }
      return;
    }
    try {
      await onSave({
        ...reapproving,
        contentJson: sectionsToDocument(reapproving.sections),
        confirmedReviewerIds: reviewerIds,
      });
      setSaved(reapproving);
      setReapproving(null);
    } catch (error) {
      if (error?.status !== 409) throw error;
      setReapproving(null);
      setProblem(CONFLICT);
    }
  }

  function discardReapproval() {
    if (reapproving === PROPOSAL_REAPPROVAL) {
      setReapproving(null);
      leaveProposal();
      return;
    }
    // Discarding an AI draft is the preview's own Discard, not a revert of
    // edits made here: there are none.
    if (reapproving === DRAFT_REAPPROVAL) {
      setReapproving(null);
      setAccepting(false);
      aiDraft.onDiscard();
      return;
    }
    setDoc(saved);
    cancelEditing();
    setReapproving(null);
  }

  // A review covers the saved version, so unsaved edits are saved first.
  async function startSubmit() {
    if (!dirty || (await save())) setSubmitting(true);
  }

  async function submitReview(reviewerIds) {
    try {
      await onSubmitReview(reviewerIds);
      setSubmitting(false);
    } catch (error) {
      if (STALE_REVIEW_CODES.has(error?.code)) {
        setSubmitting(false);
        setProblem(CONFLICT);
        return;
      }
      if (error?.code === "review_in_progress") onRetryDetail?.();
      throw error;
    }
  }

  async function decideReview(decision) {
    try {
      await onDecideReview(decision);
      setReviewChoice(null);
    } catch (error) {
      if (!STALE_REVIEW_CODES.has(error?.code)) throw error;
      setProblem(CONFLICT);
    }
  }

  function jumpToReview(choice) {
    // Split view hides the side panel, and the review card lives in it, so
    // close the chat first or this scrolls to something nobody can see.
    setSplit(false);
    setReviewChoice(choice);
    setRailTab("review");
    setReviewJump((value) => value + 1);
  }

  useEffect(() => {
    if (!reviewJump) return;
    reviewCard.current?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    reviewCard.current?.querySelector("textarea")?.focus();
  }, [reviewJump]);

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
    if (unsaved) setLeaving(() => action);
    else action();
  }

  async function acceptDraft() {
    setAccepting(true);
    setProblem(null);
    try {
      await aiDraft.onAccept();
    } catch (error) {
      setAccepting(false);
      // Accepting into an approved PRD needs the same confirmation as a hand
      // edit. There's no document to resend here, only the draft, so the
      // dialog is opened against DRAFT_REAPPROVAL instead of a document.
      if (error?.code === "reapproval_required") {
        setReapproving(DRAFT_REAPPROVAL);
        return;
      }
      setProblem(
        isDraftOutOfDate(error)
          ? {
              title: "This draft is out of date.",
              message: "The PRD changed or the draft expired. Generate a new one.",
              regenerate: true,
            }
          : { title: "Couldn’t accept this draft.", message: error?.message || "Try again.", conflict: false },
      );
    }
  }

  // --- conversational editing -------------------------------------------------

  // "Propose changes" in the chat. The proposal is compared with the saved
  // PRD and accepted as a whole, so unsaved edits are saved first; nothing is
  // asked of the AI until they are.
  async function requestProposal(instruction) {
    if (proposing) return;
    setProposeError(null);
    if (dirty) {
      setProposeError("Save your edits first, then propose changes.");
      return;
    }
    setProposing(true);
    try {
      const result = await onRequestProposal(instruction, sessionMessagesFrom(chat));
      // Refusals and clarifications are answers in the chat; a proposal opens
      // the comparison (Prototype sets `proposal`) and its explanation joins
      // the conversation.
      setChat?.((log) => [...log, { from: "ai", kind: result.kind, text: result.message }]);
    } catch (error) {
      if (error?.code === "stale_revision") {
        // Someone saved since this page loaded: the banner offers the latest
        // version, and the conversation stays for asking again.
        setProposeError("This PRD changed since you opened it. Load the latest version, then propose changes again.");
        setProblem(CONFLICT);
      } else {
        setProposeError(describeProposalError(error));
      }
    } finally {
      setProposing(false);
    }
  }

  // "Ask AI to address" in the Comments tab. The panel shows the error and
  // keeps the picked comments, so this rejects with a sentence to show.
  async function requestFeedbackProposal(commentIds, instruction) {
    if (dirty) throw new Error("Save your edits first, then ask for changes.");
    try {
      await onRequestFeedbackProposal(commentIds, instruction);
    } catch (error) {
      if (error?.code === "stale_revision") {
        setProblem(CONFLICT);
        throw new Error("This PRD changed since you opened it. Load the latest version, then try again.", {
          cause: error,
        });
      }
      throw new Error(describeProposalError(error), { cause: error });
    }
  }

  async function acceptProposal() {
    setAccepting(true);
    setProposalProblem(null);
    try {
      await onAcceptProposal();
    } catch (error) {
      setAccepting(false);
      // An approved PRD: the owner confirms reviewers, then it's sent again.
      if (needsReapproval(error)) {
        setReapproving(PROPOSAL_REAPPROVAL);
        return;
      }
      setProposalProblem({ message: describeProposalError(error), askAgain: mustAskAgain(error) });
    }
  }

  // Request adjustments: the comparison keeps its "current" side and the
  // proposal is replaced by the adjusted one. The request and the reply join
  // the conversation. A refusal or clarification is shown in the form with
  // the request kept (this rejects); a proposal that can't be used any more
  // gets the same notice as on accept.
  async function adjustProposal(instruction) {
    setAdjusting(true);
    setProposalProblem(null);
    try {
      const result = await onAdjustProposal(instruction, sessionMessagesFrom(chat));
      setChat?.((log) => [...log, { from: "you", text: instruction }, { from: "ai", kind: result.kind, text: result.message }]);
      if (result.kind !== "proposal") throw new Error(result.message);
    } catch (error) {
      if (mustAskAgain(error)) {
        setProposalProblem({ message: describeProposalError(error), askAgain: true });
        return;
      }
      throw error?.code ? new Error(describeProposalError(error), { cause: error }) : error;
    } finally {
      setAdjusting(false);
    }
  }

  // Back to the PRD without the proposal. After a conflict the latest
  // version is loaded too, so asking again starts from it. The conversation
  // stays either way.
  function leaveProposal(reloadAfter = false) {
    setProposalProblem(null);
    setAccepting(false);
    onDiscardProposal();
    if (reloadAfter) reload();
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
          { label: proposal ? "Proposed changes" : "Editor", current: true },
        ]}
        // Status is shown, not set here: it changes only through the review
        // workflow (Decision 6).
        after={<StatusChip status={prd.status} reviewState={prd.reviewState} />}
        actions={
          // The comparison has its own Accept and Discard; nothing else here
          // applies to a proposal.
          proposal ? null : (
          <>
            {saveState ? (
              <span className={`ne-savestate ${saveState[0]}`} role="status">
                <span className="ne-savestate-dot" aria-hidden="true" />
                {saveState[1]}
                {saveState[2] ? <span className="ne-hide-sm"> · {saveState[2]}</span> : null}
              </span>
            ) : viewOnly ? (
              <span className="ne-viewonly">View only</span>
            ) : null}
            {/* Side by side with the chat, as the split-view design. Off by
                default, so the usual three columns are what you get. Not
                during an AI preview, which has no chat to put beside it. Not
                on phones either: the header has no room left for it there, and
                the chat is a tab away in the side panel. */}
            {aiDraft ? null : (
              <button
                type="button"
                // Hidden on phones, where the header has no room for it --
                // but never while the pane is open, or there would be no way
                // to close it after the window narrows.
                className={`nw-btn nw-btn-secondary ne-btn-38${split ? "" : " ne-hide-sm"}`}
                aria-pressed={split}
                onClick={() => setSplit((on) => !on)}
              >
                <IconChat />
                {split ? "Close chat" : "Ask Nautilus"}
              </button>
            )}
            {canShare ? (
              <button type="button" className="nw-btn nw-btn-secondary ne-btn-38" onClick={() => setSharing(true)}>
                <IconPeople size={16} />
                Share
              </button>
            ) : null}
            {aiDraft ? (
              <>
                <button
                  type="button"
                  className="nw-btn nw-btn-secondary ne-btn-38"
                  onClick={aiDraft.onDiscard}
                  disabled={accepting}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="nw-btn nw-btn-primary ne-btn-38"
                  onClick={acceptDraft}
                  disabled={accepting}
                >
                  {accepting ? "Accepting…" : "Accept draft"}
                </button>
              </>
            ) : (
              <MenuButton
                label="Export"
                className="nw-btn nw-btn-secondary ne-btn-38"
                heading={dirty ? "Exports the last saved version" : "Download this PRD"}
                items={exportItems}
              >
                <IconDownload />
                Export
              </MenuButton>
            )}
            {canEdit ? (
              <button type="button" className="nw-btn nw-btn-primary ne-btn-38" onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </button>
            ) : null}
            {canSubmitReview ? (
              <button
                type="button"
                className="nw-btn nw-btn-secondary ne-btn-38"
                onClick={startSubmit}
                disabled={saving}
              >
                Submit for review
              </button>
            ) : null}
            {canApprove ? (
              <>
                <button
                  type="button"
                  className="nw-btn nw-btn-secondary ne-btn-38"
                  onClick={() => jumpToReview("changes_requested")}
                >
                  Request changes
                </button>
                <button
                  type="button"
                  className="nw-btn nw-btn-primary ne-btn-38"
                  onClick={() => jumpToReview("approved")}
                >
                  Approve
                </button>
              </>
            ) : null}
          </>
          )
        }
      />

      {aiDraft || problem || detail?.error || detail?.changedSinceApproval ? (
        <div className="ne-alerts">
          {aiDraft ? (
            <p className="ne-changed" role="status">
              <strong>AI draft, not saved yet.</strong> Read it through, then accept it to save it to this PRD and start
              editing, or discard it.
            </p>
          ) : null}
          {detail?.changedSinceApproval ? (
            <p className="ne-changed" role="status">
              <strong>Changed since approval.</strong> This PRD was approved, then edited. The new version needs
              approval again.
            </p>
          ) : null}
          {detail?.error ? (
            <Alert onRetry={onRetryDetail}>
              <strong>Couldn’t check what you can do on this PRD.</strong> You can read it for now. {detail.error}
            </Alert>
          ) : null}
          {problem ? (
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
              {problem.regenerate ? (
                <>
                  {" "}
                  <button type="button" className="ne-alert-action" onClick={aiDraft.onRegenerate}>
                    Generate again
                  </button>
                </>
              ) : null}
            </Alert>
          ) : null}
        </div>
      ) : null}

      {proposal ? (
        <div className="ne-compare">
          <PrdProposalComparison
            currentDocument={proposal.originalDocument}
            proposedDocument={proposal.proposedDocument}
            explanation={proposal.explanation}
            busy={accepting}
            onAccept={acceptProposal}
            onAdjust={onAdjustProposal ? adjustProposal : undefined}
            adjusting={adjusting}
            onDiscard={() => leaveProposal()}
            notice={
              proposalProblem ? (
                <Alert onDismiss={proposalProblem.askAgain ? undefined : () => setProposalProblem(null)}>
                  {proposalProblem.message}
                  {proposalProblem.askAgain ? (
                    <>
                      {" "}
                      <button type="button" className="ne-alert-action" onClick={() => leaveProposal(true)}>
                        Back to the PRD
                      </button>
                    </>
                  ) : null}
                </Alert>
              ) : null
            }
          />
        </div>
      ) : (
      <div className={`ne-body${split ? " is-split" : ""}`}>
        {/* Split view drops the contents list and the review panel, as the
            design does, so the chat and the document each get real room.
            Everything they hold is a toggle away. */}
        {split ? (
          <section className="ne-pane-chat" aria-label="Ask Nautilus">
            <AskAiPanel
              key={prd.id}
              prd={prd}
              standalone
              chat={chat}
              setChat={setChat}
              onPropose={canPropose ? requestProposal : undefined}
              proposing={proposing}
              proposeError={proposeError}
            />
          </section>
        ) : null}
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
                {progress ? (
                  <div>
                    <dt>Review</dt>
                    <dd>{progress}</dd>
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
              {viewOnly ? (
                <p className="ne-readonly-note">
                  {prd.status === "final" || prd.status === "assigned"
                    ? "This PRD is approved. Only its owners can change it now."
                    : canApprove
                      ? "You’ve been asked to review this PRD. You can read and export it, but not edit it."
                      : "You can read and export this PRD. Ask its owner for edit access to change it."}
                </p>
              ) : null}
            </header>

            {doc.sections.length ? null : (
              // Nothing saved yet: a PRD in review or approved, or one a
              // viewer opened. The interview is only offered to a draft its
              // opener can write, so there is nothing to send them to here.
              <div className="ne-empty ne-empty-doc">
                <span>This PRD has no content yet.</span>
                {canEdit ? (
                  <button type="button" className="ne-link-btn" onClick={openAnswers}>
                    Answer the interview questions
                  </button>
                ) : null}
              </div>
            )}

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

        <aside className="ne-rail" aria-label="Review, AI and comments">
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
            {/* Anyone who can view the PRD may ask (Decision 5). can_request_ai
                is for the AI actions that change it. Not on an unsaved draft,
                since the chat reads the saved PRD. */}
            {aiDraft || split ? null : (
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
            )}
            {/* Anyone who can view the PRD can read and post comments. Not on
                an unsaved draft: comments belong to a saved version. */}
            {aiDraft ? null : (
              <button
                type="button"
                role="tab"
                id={`${ids}-tab-comments`}
                aria-selected={railTab === "comments"}
                aria-controls={`${ids}-panel-comments`}
                className={`ne-rail-tab${railTab === "comments" ? " is-active" : ""}`}
                onClick={() => setRailTab("comments")}
              >
                Comments
              </button>
            )}
          </div>

          {/* Distinct keys: these panels are siblings, and a shared key keeps a
              stale chat behind when split view takes it out of the rail. */}
          {aiDraft || split ? null : (
            <AskAiPanel
              key={`ai-${prd.id}`}
              prd={prd}
              id={`${ids}-panel-ai`}
              labelledBy={`${ids}-tab-ai`}
              hidden={railTab !== "ai"}
              chat={chat}
              setChat={setChat}
              onPropose={canPropose ? requestProposal : undefined}
              proposing={proposing}
              proposeError={proposeError}
            />
          )}
          {aiDraft ? null : (
            <CommentsPanel
              key={`comments-${prd.id}`}
              prd={prd}
              currentVersionId={detail?.currentVersion?.id ?? null}
              onSuggest={canSuggest ? requestFeedbackProposal : undefined}
              onRefresh={onRetryDetail}
              id={`${ids}-panel-comments`}
              labelledBy={`${ids}-tab-comments`}
              hidden={railTab !== "comments"}
            />
          )}
          {railTab === "ai" || railTab === "comments" ? null : (
          <div role="tabpanel" id={`${ids}-panel-review`} aria-labelledby={`${ids}-tab-review`}>
          {canApprove ? (
            <YourReviewCard
              ref={reviewCard}
              choice={reviewChoice}
              blocked={dirty}
              onChoose={setReviewChoice}
              onDecide={decideReview}
            />
          ) : null}
          <ApprovalsCard approval={detail?.approval} userId={userId} />
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
      )}

      {/* Closes by itself if a change here takes away the right to manage people. */}
      <ShareDialog
        open={sharing && canShare}
        prd={prd}
        organizationId={organizationId}
        userId={userId}
        onChanged={onRetryDetail}
        onClose={() => setSharing(false)}
      />

      {aiDraft || proposal ? (
        <LeaveDraftDialog
          proposal={Boolean(proposal)}
          open={leaving !== null}
          onStay={() => setLeaving(null)}
          onDiscard={() => {
            const action = leaving;
            setLeaving(null);
            if (proposal) onDiscardProposal();
            action();
          }}
        />
      ) : null}
      <ReapprovalDialog
        open={reapproving !== null}
        prdId={prd.id}
        organizationId={organizationId}
        owners={detail?.owners ?? owners}
        userId={userId}
        onApply={applyReapproval}
        onDiscard={discardReapproval}
        onClose={() => setReapproving(null)}
      />

      <SubmitReviewDialog
        open={submitting && canSubmitReview}
        prd={{ ...prd, title: doc.title }}
        organizationId={organizationId}
        owners={detail?.owners ?? []}
        userId={userId}
        onSubmit={submitReview}
        onClose={() => setSubmitting(false)}
      />

      <LeaveDialog
        open={leaving !== null && !aiDraft && !proposal}
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
