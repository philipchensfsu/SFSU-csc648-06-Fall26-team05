import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import {
  QUESTIONS,
  documentToSections,
  fromApiIntakeAnswers,
  fromApiPrd,
  fromApiPrdDetail,
  sameJson,
} from "./data";
import { api } from "../../lib/api";
import { startsInInterview } from "../nautilus/app/format";
import { describeGenerationError, isAiUnavailable } from "../nautilus/app/editor/aiDraft";
import { chatMessages, updateChatLog } from "../nautilus/app/editor/chatLog";
import { acceptProposal, requestFeedbackRevision, requestRevision } from "../nautilus/app/editor/proposal";
import Workspace from "../nautilus/app/Workspace";
import CreatePrdPage from "../nautilus/app/flow/CreatePrdPage";
import InterviewPage from "../nautilus/app/flow/InterviewPage";
import ReviewPage from "../nautilus/app/flow/ReviewPage";
import { isAnswered } from "../nautilus/app/questions";
import { createDraftCreator } from "../nautilus/app/flow/draftCreation";
import GeneratingPage from "../nautilus/app/editor/GeneratingPage";
import { draftFromAnswers } from "../nautilus/app/editor/draftFromAnswers";

// The editor carries TipTap, so it loads only when a PRD is opened.
const EditorPage = lazy(() => import("../nautilus/app/editor/EditorPage"));

// App renders this workspace only after Supabase confirms a signed-in user
// who is in an organization (OrgGate). `userName` and `userId` come from that
// session; `organization` is { organization_id, name, access_role }.
function Prototype({
  initialUser = null,
  userName = "",
  userId = null,
  organization = null,
  onNoOrganization,
  recheckOrganization,
  onLogOut,
}) {
  const user = initialUser;
  const [screen, setScreen] = useState("dashboard");
  // Which workspace page the "dashboard" screen shows: { page: "dashboard" },
  // { page: "projects", projectId } or { page: "search", query }. Kept here,
  // so leaving a flow (Cancel, Save & exit) returns to where it started.
  const [home, setHome] = useState({ page: "dashboard", visit: 0 });
  // Start empty rather than with mock data, so a real user never sees (or
  // clicks) placeholder PRDs before the API responds.
  const [prds, setPrds] = useState([]);
  const [prdsLoaded, setPrdsLoaded] = useState(false);
  const [projects, setProjects] = useState([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [activePrdId, setActivePrdId] = useState(null);
  // The project a new PRD goes into when started from a project page.
  const [newPrdProjectId, setNewPrdProjectId] = useState(null);
  const [interviewStart, setInterviewStart] = useState(null);
  const draftCreator = useRef(null);
  const [projectsError, setProjectsError] = useState(null);
  const [prdsError, setPrdsError] = useState(null);
  const latestLoad = useRef(0);
  const visits = useRef(0);
  const answersRequested = useRef(new Set());
  // The generation screen's state (GeneratingPage draws it), with the draft
  // waiting to be accepted or discarded once it's done.
  const [generation, setGeneration] = useState(null);
  const latestGeneration = useRef(0);
  // Bumped after "Load the latest version", so the editor remounts with it.
  const [editorVersion, setEditorVersion] = useState(0);
  // What the open PRD's detail read says the caller may do: { id, capabilities,
  // approval, ... }, { id, error } if it couldn't be read, null until it arrives.
  const [prdDetail, setPrdDetail] = useState(null);
  const latestDetail = useRef(0);
  // Conversational editing for the open PRD: the Ask AI conversation
  // ({ prdId, messages }) and a proposal waiting to be compared and accepted
  // ({ prdId, ...proposal from editor/proposal.js }). Kept here, not in the
  // editor, so they outlive its remounts (a reload, an accepted proposal)
  // and the chat moving between the side panel and split view.
  const [chatLog, setChatLog] = useState(null);
  // The PRD open now. AI replies come back after an await, through callbacks
  // bound to the PRD that was open when they started; a reply for one that's
  // no longer open is dropped (editor/chatLog.js).
  const openPrdIdRef = useRef(null);
  const [aiProposal, setAiProposal] = useState(null);

  const activePrd = prds.find((prd) => prd.id === activePrdId) ?? null;

  useEffect(() => {
    openPrdIdRef.current = activePrdId;
  }, [activePrdId]);

  // Takes only the detail fields, status and the caller's role from the row. The
  // revision stays the one the editor's content came from, so a newer save
  // elsewhere still ends in a 409 rather than being overwritten.
  const loadDetail = useCallback((id) => {
    const requestId = ++latestDetail.current;
    return api
      .getPrd(id)
      .then((row) => {
        if (requestId !== latestDetail.current) return;
        setPrdDetail({ id, ...fromApiPrdDetail(row) });
        setPrds((current) =>
          current.map((p) =>
            p.id === id
              ? { ...p, status: row.status, reviewState: row.review_state ?? null, myRole: row.my_role ?? p.myRole }
              : p,
          ),
        );
      })
      .catch((error) => {
        if (requestId !== latestDetail.current) return;
        // This person can't see the PRD any more (removed from it, say).
        if (error.status === 404) {
          setActivePrdId(null);
          setScreen("dashboard");
          return;
        }
        // A refetch that fails keeps what was already known.
        setPrdDetail((current) => (current?.id === id && current.capabilities ? current : { id, error: error.message }));
      });
  }, []);

  useEffect(() => {
    if (screen !== "editor" || !activePrdId) return undefined;
    loadDetail(activePrdId);
    return () => {
      latestDetail.current += 1;
      setPrdDetail(null);
    };
  }, [screen, activePrdId, loadDetail]);

  const loadProjects = useCallback(() => {
    setProjectsError(null);
    api
      .listProjects()
      .then((real) => {
        setProjects(real);
        setProjectsLoaded(true);
      })
      .catch((error) => setProjectsError(error.message));
  }, []);

  // The workspace reloads the full list every time it is shown, which also
  // keeps it fresh after editing. Interview answers already fetched for a
  // PRD are kept, so progress bars don't flicker.
  const loadPrds = useCallback(() => {
    // Ignore responses that arrive after a newer load was started, so a slow
    // early request can't overwrite the results of a later one.
    const requestId = ++latestLoad.current;
    setPrdsError(null);
    api
      .listPrds()
      .then((rows) => {
        if (requestId !== latestLoad.current) return;
        setPrds((current) => {
          const known = new Map(current.map((prd) => [prd.id, prd]));
          return rows.map((row) => {
            const prd = fromApiPrd(row);
            const before = known.get(prd.id);
            return before?.answersLoaded
              ? { ...prd, answers: before.answers, answersLoaded: true }
              : prd;
          });
        });
        setPrdsLoaded(true);
      })
      .catch((error) => {
        if (requestId === latestLoad.current) setPrdsError(error.message);
      });
  }, []);

  const refresh = useCallback(() => {
    loadProjects();
    loadPrds();
  }, [loadProjects, loadPrds]);

  // Saved answers for drafts whose interview progress the workspace shows.
  // Each PRD is fetched once; after that its answers live in `prds`.
  const loadAnswers = useCallback((ids) => {
    ids.forEach((id) => {
      if (answersRequested.current.has(id)) return;
      answersRequested.current.add(id);
      api
        .listIntakeAnswers(id)
        .then((rows) => {
          const answers = fromApiIntakeAnswers(rows);
          setPrds((current) =>
            current.map((prd) => (prd.id === id && !prd.answersLoaded ? { ...prd, answers, answersLoaded: true } : prd)),
          );
        })
        .catch(() => answersRequested.current.delete(id));
    });
  }, []);

  // Search runs on the server (title + content_text, GET /api/prds?search=)
  // and doesn't touch `prds`, so the dashboard's counts stay whole.
  const searchPrds = useCallback(
    (term) => api.listPrds(term).then((rows) => rows.map(fromApiPrd)),
    [],
  );

  function go(nextScreen, prdId = activePrdId) {
    if (nextScreen !== "dashboard") latestLoad.current += 1;
    // The chat and any proposal belong to the open PRD only.
    if (prdId !== activePrdId) {
      setChatLog(null);
      setAiProposal(null);
    }
    setActivePrdId(prdId);
    setScreen(nextScreen);
    window.scrollTo(0, 0);
  }

  // Shows a workspace page: the dashboard, a project or search.
  const showHome = useCallback((next) => {
    visits.current += 1;
    setHome({ ...next, visit: visits.current });
    setActivePrdId(null);
    setChatLog(null);
    setAiProposal(null);
    setScreen("dashboard");
  }, []);

  const setSearchQuery = useCallback((query) => {
    setHome((current) => ({ ...current, query }));
  }, []);

  function signOut() {
    onLogOut?.();
  }

  function startNewPrd(projectId = null) {
    draftCreator.current = null;
    setNewPrdProjectId(projectId);
    go("create", null);
  }

  // Retain a partially created draft so retrying its description/notes never
  // creates a second PRD. Each callback reflects only server-confirmed data.
  async function createPrd(payload) {
    if (!draftCreator.current) {
      draftCreator.current = createDraftCreator(api, (row, answers) => {
        const prd = { ...fromApiPrd(row), answers, answersLoaded: true };
        setPrds((current) => [prd, ...current.filter((p) => p.id !== prd.id)]);
      });
    }
    let row;
    try {
      row = await draftCreator.current(payload);
    } catch (error) {
      // The account lost its organization (e.g. deactivated) since signing in.
      if (error.code === "no_organization") onNoOrganization?.();
      throw error;
    }
    setInterviewStart(null);
    go("interview", row.id);
  }

  function openPrd(prd) {
    // A PRD opened from search may not be in the list yet.
    setPrds((current) => (current.some((p) => p.id === prd.id) ? current : [prd, ...current]));
    // Back to a generation still running or a draft still waiting, as the
    // generating screen promises when it says you can leave.
    if (generation?.prdId === prd.id && generation.status !== "failed") {
      go("generating", prd.id);
      return;
    }
    // Anything with content opens in the editor. So does a PRD with nothing
    // saved that doesn't belong in the interview -- one in review, approved,
    // or opened by someone who can't write it -- which lands on the editor's
    // empty state rather than being asked interview questions.
    if (prd.sections || !startsInInterview(prd)) {
      go("editor", prd.id);
      return;
    }
    // Load saved answers *before* showing the wizard: Interview picks its
    // starting question from `answers` once, on mount. A finished interview
    // goes straight to the review screen.
    api
      .listIntakeAnswers(prd.id)
      .then((rows) => {
        const answers = fromApiIntakeAnswers(rows);
        setPrds((current) =>
          current.map((p) => (p.id === prd.id ? { ...p, answers, answersLoaded: true } : p)),
        );
        const finished = QUESTIONS.every((question) => isAnswered(question, answers));
        setInterviewStart(null);
        go(finished ? "review" : "interview", prd.id);
      })
      .catch((error) => setPrdsError(error.message));
  }

  // The inbox only knows a PRD's id. Rejects if this person can't open it.
  async function openPrdById(id) {
    const known = prds.find((prd) => prd.id === id);
    openPrd(known ?? fromApiPrd(await api.getPrd(id)));
  }

  // Renaming uses the same optimistic-concurrency check as saving content;
  // on a 409 the list is reloaded so trying again works.
  function renamePrd(prd, title) {
    return api
      .updatePrd(prd.id, { revision: prd.revision, title })
      .then((saved) => {
        setPrds((current) =>
          current.map((p) =>
            p.id === prd.id
              ? { ...fromApiPrd(saved), answers: p.answers, answersLoaded: p.answersLoaded }
              : p,
          ),
        );
      })
      .catch((error) => {
        loadPrds();
        throw error;
      });
  }

  function deletePrd(prd) {
    return api
      .deletePrd(prd.id)
      .then(() => setPrds((current) => current.filter((p) => p.id !== prd.id)));
  }

  function createProject(name) {
    return api.createProject(name).then((created) => {
      setProjects((current) => [created, ...current]);
      return created;
    });
  }

  function renameProject(id, name) {
    return api.renameProject(id, name).then((updated) => {
      setProjects((current) => current.map((project) => (project.id === id ? updated : project)));
    });
  }

  function deleteProject(id) {
    return api.deleteProject(id).then(() => {
      setProjects((current) => current.filter((project) => project.id !== id));
      setPrds((current) => current.filter((prd) => prd.projectId !== id));
    });
  }

  // Counted on the server, so the "this deletes N PRDs" warning is current.
  function countProjectPrds(id) {
    return api.listPrds().then((rows) => rows.filter((row) => row.project_id === id).length);
  }

  // The interview keeps unsaved edits locally. Publish answers to the rest
  // of the app only after the API confirms them; failures stay in the flow.
  async function saveAnswer(prdId, key, text) {
    const question = QUESTIONS.find((item) => item.id === key);
    // A required question may be temporarily blank, but it is never skipped.
    // Only an empty optional answer carries the skipped flag.
    const skipped = Boolean(question && !question.required && !text.trim());
    const saved = await api.saveIntakeAnswer(prdId, key, text, skipped);
    setPrds((current) => current.map((prd) => prd.id === prdId
      ? { ...prd, answers: { ...prd.answers, ...fromApiIntakeAnswers([saved]) }, answersLoaded: true }
      : prd));
  }

  function openInterview(questionId = null) {
    setInterviewStart(questionId);
    go("interview");
  }

  // Puts a PRD row from the API into the list, keeping its loaded answers.
  function applyRow(row) {
    setPrds((current) =>
      current.map((p) =>
        p.id === row.id ? { ...fromApiPrd(row), answers: p.answers, answersLoaded: p.answersLoaded } : p,
      ),
    );
  }

  // Shared by the editor's Save and "Start from my answers": saves the title,
  // description and v2 document (`contentJson`) in one PUT, with the revision
  // the UI last saw (409 if someone else saved first). The server derives
  // content_text, and status is never sent (Decision 6).
  function saveDocument(id, doc) {
    const prd = prds.find((p) => p.id === id);
    if (!prd) return Promise.reject(new Error("This PRD is no longer in your list."));
    const title = doc.title ?? prd.title;
    const description = (doc.description ?? prd.description) || null;
    const contentJson = doc.contentJson;

    function matchesRequestedSave(row) {
      return row.title === title
        && (row.description || null) === description
        && sameJson(row.content_json, contentJson);
    }

    return api
      .updatePrd(id, {
        revision: prd.revision,
        title,
        description,
        content_json: contentJson,
        // Only when an owner confirms reviewers for edits to an approved PRD.
        ...(doc.confirmedReviewerIds ? { confirmed_reviewer_ids: doc.confirmedReviewerIds } : {}),
      })
      .catch(async (error) => {
        if (error.code === "invalid_document") {
          // The editor's schema should never produce this; the paths say where.
          console.error("The server rejected the document:", error.errors);
          throw new Error("This PRD has content that can’t be saved. Undo your last change and try again.", { cause: error });
        }
        if (error.status !== 409) throw error;

        // The first save may have succeeded even if its response was lost.
        // Reload and accept it only when the server has the exact requested content.
        const latest = await api.getPrd(id);
        if (!matchesRequestedSave(latest)) throw error;
        return latest;
      })
      .then((saved) => {
        applyRow(saved);
        return saved;
      });
  }

  function reloadPrd(id) {
    return api.getPrd(id).then((row) => {
      applyRow(row);
      setPrdDetail({ id, ...fromApiPrdDetail(row) });
      setEditorVersion((version) => version + 1);
    });
  }

  // A review changes the PRD's revision and status, so the editor takes the
  // new revision (or its next save would look stale) and reads the detail again.
  function applyReviewResult(id, result) {
    setPrds((current) =>
      current.map((p) =>
        p.id === id
          ? { ...p, revision: result.revision, status: result.status, reviewState: result.round?.state ?? null }
          : p,
      ),
    );
    return loadDetail(id);
  }

  // The version comes from a fresh read, since a save just before this may not
  // have reached the detail yet. The revision stays the editor's, so a save
  // from someone else is refused rather than sent for review unseen.
  function submitReview(id, reviewerIds) {
    const prd = prds.find((p) => p.id === id);
    if (!prd) return Promise.reject(new Error("This PRD is no longer in your list."));
    return api
      .getPrd(id)
      .then((row) =>
        api.submitReview(id, { revision: prd.revision, versionId: row.current_version?.id, reviewerIds }),
      )
      .then((result) => applyReviewResult(id, result));
  }

  // Decides on the round the page is showing, so a newer one is refused.
  function decideReview(id, { decision, explanation }) {
    const approval = prdDetail?.id === id ? prdDetail.approval : null;
    if (!approval?.round_id) return Promise.reject(new Error("This review is no longer open."));
    return api
      .decideReview(id, approval.round_id, { versionId: approval.version_id, decision, explanation })
      .then((result) => applyReviewResult(id, result));
  }

  // Runs from the latest revision, since nothing is being edited on this path.
  // The answer is dropped if another generation has started since.
  async function startGeneration() {
    const id = activePrdId;
    const requestId = ++latestGeneration.current;
    const startedAt = Date.now();
    setGeneration({ prdId: id, status: "running", startedAt, error: "" });
    go("generating");
    try {
      const row = await api.getPrd(id);
      applyRow(row);
      const result = await api.generatePrd(id, row.revision);
      if (requestId !== latestGeneration.current) return;
      const sections = documentToSections(result.proposal.content_json);
      if (!sections) throw new Error("The AI didn’t return a usable draft. Try again.");
      setGeneration({
        prdId: id,
        status: "done",
        startedAt,
        error: "",
        draft: {
          title: result.proposal.title,
          description: result.proposal.description ?? null,
          contentJson: result.proposal.content_json,
          sections,
          baseRevision: result.base_revision,
          generationRecordId: result.generation_record_id,
        },
      });
    } catch (error) {
      if (requestId !== latestGeneration.current) return;
      setGeneration({
        prdId: id,
        status: "failed",
        startedAt,
        error: describeGenerationError(error),
        unavailable: isAiUnavailable(error),
      });
    }
  }

  // The normal save, marked as this draft: the revision it was made from, and
  // the record id that tells the server the content came from the AI.
  // `confirmedReviewerIds` is sent only after the server refused the save
  // with reapproval_required and the owner confirmed who reviews it again.
  function acceptDraft(id, confirmedReviewerIds) {
    const { draft } = generation;
    return api
      .updatePrd(id, {
        revision: draft.baseRevision,
        title: draft.title,
        description: draft.description,
        content_json: draft.contentJson,
        generation_record_id: draft.generationRecordId,
        ...(confirmedReviewerIds ? { confirmed_reviewer_ids: confirmedReviewerIds } : {}),
      })
      .then((saved) => {
        applyRow(saved);
        setGeneration(null);
        setEditorVersion((version) => version + 1);
        go("editor", id);
      });
  }

  // Nothing was saved, so back to whatever the PRD already had.
  function discardDraft() {
    const hasContent = Boolean(activePrd?.sections);
    setGeneration(null);
    go(hasContent ? "editor" : "review");
  }

  // --- conversational editing ------------------------------------------------

  function chatFor(id) {
    return chatMessages(chatLog, id);
  }

  function setChatFor(id, update) {
    setChatLog((current) => updateChatLog(current, id, openPrdIdRef.current, update));
  }

  // A proposal only opens on the PRD it was made for, and only while that
  // PRD is still the one open.
  function openProposal(id, proposal) {
    if (openPrdIdRef.current === id) setAiProposal({ ...proposal, prdId: id });
  }

  // Asks for one proposal from the conversation, against the revision this
  // page has. A proposal opens the comparison; refusals and clarifications
  // come back for the chat to show.
  async function requestProposal(id, instruction, sessionMessages) {
    const prd = prds.find((p) => p.id === id);
    if (!prd) throw new Error("This PRD is no longer in your list.");
    const result = await requestRevision(api, id, { revision: prd.revision, instruction, sessionMessages });
    if (result.kind === "proposal") openProposal(id, result.proposal);
    return result;
  }

  // The same, addressing chosen review comments (owners only).
  async function requestFeedbackProposal(id, commentIds, instruction) {
    const prd = prds.find((p) => p.id === id);
    if (!prd) throw new Error("This PRD is no longer in your list.");
    const result = await requestFeedbackRevision(api, id, { revision: prd.revision, feedbackIds: commentIds, instruction });
    openProposal(id, result.proposal);
    return result;
  }

  // Saves the whole proposal: the server's document as sent, never title or
  // description (editor/proposal.js). The editor then remounts with the saved
  // PRD; the conversation stays.
  async function acceptAiProposal(id, confirmedReviewerIds) {
    if (aiProposal?.prdId !== id) throw new Error("This proposal is no longer open.");
    const saved = await acceptProposal(api, id, aiProposal, { confirmedReviewerIds });
    applyRow(saved);
    setAiProposal(null);
    loadDetail(id);
    setEditorVersion((version) => version + 1);
  }

  // "Start from my answers": each answer goes into its section and nothing
  // is made up (draftFromAnswers.js).
  async function startFromAnswers(id) {
    const prd = prds.find((p) => p.id === id);
    await saveDocument(id, { contentJson: draftFromAnswers(prd?.answers ?? {}) });
    go("editor", id);
  }

  // The editor's "Discovery answers" link: loads the answers first, since
  // the review screen reads them once.
  function openAnswers(id) {
    const prd = prds.find((p) => p.id === id);
    const ready = prd?.answersLoaded
      ? Promise.resolve()
      : api.listIntakeAnswers(id).then((rows) => {
          const answers = fromApiIntakeAnswers(rows);
          setPrds((current) => current.map((p) => (p.id === id ? { ...p, answers, answersLoaded: true } : p)));
        });
    return ready.then(() => {
      setInterviewStart(null);
      go("review", id);
    });
  }

  // These screens include their own top bar; auth remains owned by App.
  if (screen === "create") {
    return <CreatePrdPage
      projects={projects}
      initialProjectId={newPrdProjectId}
      onCreate={createPrd}
      onCancel={() => go("dashboard", null)}
      onHome={() => showHome({ page: "dashboard" })}
    />;
  }
  if (screen === "interview" && activePrd) {
    return <InterviewPage
      key={activePrd.id}
      prd={activePrd}
      questions={QUESTIONS}
      startAt={interviewStart}
      onSaveAnswer={(key, text) => saveAnswer(activePrd.id, key, text)}
      onExit={() => go("dashboard", null)}
      onHome={() => showHome({ page: "dashboard" })}
      onReview={() => go("review")}
    />;
  }
  if (screen === "review" && activePrd) {
    return <ReviewPage
      prd={activePrd}
      questions={QUESTIONS}
      onEdit={openInterview}
      onGenerate={startGeneration}
      onOpenDraft={activePrd.sections ? () => go("editor") : undefined}
      onExit={() => go("dashboard", null)}
      onHome={() => showHome({ page: "dashboard" })}
    />;
  }

  const generationHere = generation?.prdId === activePrd?.id ? generation : null;
  const draftPrd = generationHere?.draft
    ? {
        ...activePrd,
        title: generationHere.draft.title,
        description: generationHere.draft.description,
        sections: generationHere.draft.sections,
      }
    : null;

  if (screen === "generating" && activePrd && generationHere) {
    return <GeneratingPage
      prd={draftPrd ?? activePrd}
      generation={generationHere}
      onRetry={startGeneration}
      onDraftFromAnswers={() => startFromAnswers(activePrd.id)}
      onOpen={() => go("draft")}
      onBackToAnswers={() => go("review")}
      onExit={() => go("dashboard", null)}
      onHome={() => showHome({ page: "dashboard" })}
    />;
  }
  if (screen === "draft" && draftPrd) {
    return (
      <Suspense fallback={null}>
        <EditorPage
          key={`${activePrd.id}:draft:${generationHere.startedAt}`}
          prd={draftPrd}
          detail={null}
          // Owners only, so the reapproval dialog can leave them out of the
          // reviewer list. A preview keeps detail null so its capabilities
          // don't turn the editing tools on.
          owners={prdDetail?.id === activePrd.id ? prdDetail.owners : []}
          // The dialog reads the org's directory for the reviewer list.
          organizationId={organization?.organization_id}
          userId={userId}
          aiDraft={{
            onAccept: (confirmedReviewerIds) => acceptDraft(activePrd.id, confirmedReviewerIds),
            onDiscard: discardDraft,
            onRegenerate: startGeneration,
          }}
          onSave={() => Promise.resolve()}
          onReload={() => Promise.resolve()}
          onOpenAnswers={() => openAnswers(activePrd.id)}
          onExit={() => showHome({ page: "dashboard" })}
          onHome={() => showHome({ page: "dashboard" })}
        />
      </Suspense>
    );
  }
  // `sections` is null until a PRD has saved content; the editor shows its
  // empty state for those, so only the PRD itself has to be loaded.
  if (screen === "editor" && activePrd) {
    return (
      <Suspense fallback={null}>
        <EditorPage
          key={`${activePrd.id}:${editorVersion}`}
          prd={activePrd}
          detail={prdDetail?.id === activePrd.id ? prdDetail : null}
          onRetryDetail={() => loadDetail(activePrd.id)}
          organizationId={organization?.organization_id}
          userId={userId}
          // A save can change what's allowed and the banner, and the PUT
          // response doesn't say, so read the detail again.
          onSave={(doc) =>
            saveDocument(activePrd.id, doc).then((saved) => {
              loadDetail(activePrd.id);
              return saved;
            })
          }
          onSubmitReview={(reviewerIds) => submitReview(activePrd.id, reviewerIds)}
          onDecideReview={(decision) => decideReview(activePrd.id, decision)}
          chat={chatFor(activePrd.id)}
          setChat={(update) => setChatFor(activePrd.id, update)}
          proposal={aiProposal?.prdId === activePrd.id ? aiProposal : null}
          onRequestProposal={(instruction, sessionMessages) =>
            requestProposal(activePrd.id, instruction, sessionMessages)
          }
          onRequestFeedbackProposal={(commentIds, instruction) =>
            requestFeedbackProposal(activePrd.id, commentIds, instruction)
          }
          onAcceptProposal={(confirmedReviewerIds) => acceptAiProposal(activePrd.id, confirmedReviewerIds)}
          onDiscardProposal={() => setAiProposal(null)}
          onReload={() => reloadPrd(activePrd.id)}
          onOpenAnswers={() => openAnswers(activePrd.id)}
          onExit={() => showHome({ page: "dashboard" })}
          onHome={() => showHome({ page: "dashboard" })}
        />
      </Suspense>
    );
  }

  // Everything that isn't one of the flows above is the workspace: the
  // sidebar with the dashboard, a project or search (src/nautilus/app).
  return (
    <Workspace
      view={home}
      account={{ email: user, name: userName }}
      organization={organization}
      recheckOrganization={recheckOrganization}
      userId={userId}
      prds={prds}
      prdsLoaded={prdsLoaded}
      prdsError={prdsError}
      projects={projects}
      projectsLoaded={projectsLoaded}
      projectsError={projectsError}
      questions={QUESTIONS}
      onRefresh={refresh}
      onNavigate={showHome}
      onQueryChange={setSearchQuery}
      onCreatePrd={startNewPrd}
      onOpenPrd={openPrd}
      onOpenPrdById={openPrdById}
      onRenamePrd={renamePrd}
      onDeletePrd={deletePrd}
      onCreateProject={createProject}
      onRenameProject={renameProject}
      onDeleteProject={deleteProject}
      onCountProjectPrds={countProjectPrds}
      onSearchPrds={searchPrds}
      onLoadAnswers={loadAnswers}
      onDismissError={() => {
        setPrdsError(null);
        setProjectsError(null);
      }}
      onSignOut={signOut}
    />
  );
}

export default Prototype;
