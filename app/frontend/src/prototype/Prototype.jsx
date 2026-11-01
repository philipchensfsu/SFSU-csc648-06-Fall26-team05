import { Suspense, lazy, useCallback, useRef, useState } from "react";
import {
  QUESTIONS,
  fromApiIntakeAnswers,
  fromApiPrd,
  sectionsToContentJson,
  sectionsToText,
} from "./data";
import { api } from "../../lib/api";
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

// App renders this workspace only after Supabase confirms a signed-in user.
// `userName` and `userId` come from that session in App.jsx.
function Prototype({ initialUser = null, userName = "", userId = null, onLogOut }) {
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
  // The generation screen's state (GeneratingPage draws it). AI drafting
  // isn't connected yet (#69/#70), so it offers "Start from my answers".
  const [generation, setGeneration] = useState(null);
  // Bumped after "Load the latest version", so the editor remounts with it.
  const [editorVersion, setEditorVersion] = useState(0);

  const activePrd = prds.find((prd) => prd.id === activePrdId) ?? null;

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
    setActivePrdId(prdId);
    setScreen(nextScreen);
    window.scrollTo(0, 0);
  }

  // Shows a workspace page: the dashboard, a project or search.
  const showHome = useCallback((next) => {
    visits.current += 1;
    setHome({ ...next, visit: visits.current });
    setActivePrdId(null);
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
    const row = await draftCreator.current(payload);
    setInterviewStart(null);
    go("interview", row.id);
  }

  function openPrd(prd) {
    // A PRD opened from search may not be in the list yet.
    setPrds((current) => (current.some((p) => p.id === prd.id) ? current : [prd, ...current]));
    if (prd.sections) {
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
  // description and sections in one PUT, with the revision the UI last saw
  // (409 if someone else saved first). Status is never sent (Decision 6).
  function saveDocument(id, doc) {
    const prd = prds.find((p) => p.id === id);
    if (!prd) return Promise.reject(new Error("This PRD is no longer in your list."));
    const title = doc.title ?? prd.title;
    const description = doc.description ?? prd.description;
    const contentJson = sectionsToContentJson(doc.sections, description);
    const contentText = sectionsToText(doc.sections, description);

    function matchesRequestedSave(row) {
      const savedSections = row.content_json?.sections;
      return row.title === title
        && row.content_text === contentText
        && row.content_json?.description === contentJson.description
        && Array.isArray(savedSections)
        && savedSections.length === contentJson.sections.length
        && savedSections.every((saved, index) => {
          const requested = contentJson.sections[index];
          return saved.type === requested.type
            && saved.title === requested.title
            && saved.html === requested.html;
        });
    }

    return api
      .updatePrd(id, {
        revision: prd.revision,
        title,
        content_json: contentJson,
        content_text: contentText,
      })
      .catch(async (error) => {
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
      setEditorVersion((version) => version + 1);
    });
  }

  function startGeneration() {
    setGeneration({ status: "failed", unavailable: true, startedAt: Date.now(), error: "" });
    go("generating");
  }

  // "Start from my answers": each answer goes into its section and nothing
  // is made up (draftFromAnswers.js).
  async function startFromAnswers(id) {
    const prd = prds.find((p) => p.id === id);
    await saveDocument(id, { sections: draftFromAnswers(prd?.answers ?? {}) });
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

  if (screen === "generating" && activePrd && generation) {
    return <GeneratingPage
      prd={activePrd}
      generation={generation}
      onRetry={startGeneration}
      onDraftFromAnswers={() => startFromAnswers(activePrd.id)}
      onOpen={() => go("editor")}
      onBackToAnswers={() => go("review")}
      onExit={() => go("dashboard", null)}
      onHome={() => showHome({ page: "dashboard" })}
    />;
  }
  if (screen === "editor" && activePrd?.sections) {
    return (
      <Suspense fallback={null}>
        <EditorPage
          key={`${activePrd.id}:${editorVersion}`}
          prd={activePrd}
          onSave={(doc) => saveDocument(activePrd.id, doc)}
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
