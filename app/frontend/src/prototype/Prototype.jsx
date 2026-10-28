import { useCallback, useRef, useState } from "react";
import "./prototype.css";
import {
  QUESTIONS,
  draftSectionsFromAnswers,
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
import Generating from "./screens/Generating";
import Editor from "./screens/Editor";
import ExportPrd from "./screens/ExportPrd";

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
    const saved = await api.saveIntakeAnswer(prdId, key, text);
    setPrds((current) => current.map((prd) => prd.id === prdId
      ? { ...prd, answers: { ...prd.answers, ...fromApiIntakeAnswers([saved]) }, answersLoaded: true }
      : prd));
  }

  function openInterview(questionId = null) {
    setInterviewStart(questionId);
    go("interview");
  }

  // Shared by the Editor's Save button and finishGeneration below: persists
  // content_json/content_text/status to the real PRD row, using the
  // revision the UI last saw for optimistic-concurrency (409 if someone
  // else saved first). Returns the promise so callers can show save state.
  function savePrdContent(id, sections, status) {
    const prd = prds.find((p) => p.id === id);
    if (!prd) return Promise.resolve();
    return api
      .updatePrd(id, {
        revision: prd.revision,
        content_json: sectionsToContentJson(sections, prd.description),
        content_text: sectionsToText(sections, prd.description),
        status,
      })
      .then((saved) => {
        setPrds((current) =>
          current.map((p) =>
            p.id === id
              ? { ...fromApiPrd(saved), answers: p.answers, answersLoaded: p.answersLoaded }
              : p,
          ),
        );
      });
  }

  async function finishGeneration() {
    const sections = draftSectionsFromAnswers(activePrd.answers);
    await savePrdContent(activePrd.id, sections, "in_review");
    go("ready");
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
      onGenerate={() => go("generating")}
      onExit={() => go("dashboard", null)}
      onHome={() => showHome({ page: "dashboard" })}
    />;
  }

  let content = null;
  if ((screen === "generating" || screen === "ready") && activePrd) {
    content = (
      <Generating
        key={screen}
        prd={activePrd}
        done={screen === "ready"}
        shouldFail={false}
        onFinish={finishGeneration}
        onCancel={() => go("review")}
        onBackToReview={() => go("review")}
        onOpen={() => go("editor")}
      />
    );
  } else if (screen === "editor" && activePrd?.sections) {
    content = (
      <Editor
        prd={activePrd}
        // Edits keep it 'in_review' -- there's no "mark as final" action in
        // this prototype yet. Returns the save promise so the Editor can
        // show real saving/error state instead of assuming success.
        onSave={(sections) => savePrdContent(activePrd.id, sections, "in_review")}
        onDashboard={() => showHome({ page: "dashboard" })}
        onExport={() => go("export")}
      />
    );
  } else if (screen === "export" && activePrd?.sections) {
    content = <ExportPrd prd={activePrd} onBack={() => go("editor")} />;
  }

  // Everything that isn't one of the flows above is the workspace: the
  // sidebar with the dashboard, a project or search (src/nautilus/app).
  if (!content) {
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

  return (
    <div className="nt-app">
      {user ? (
        <header className="nt-header">
          <button
            type="button"
            className="nt-logo nt-link-button"
            disabled={screen === "generating"}
            onClick={() => showHome({ page: "dashboard" })}
          >
            Nautilus
          </button>
          <div className="nt-header-user">
            <span>{user}</span>
            <button type="button" className="nt-btn nt-btn-ghost" disabled={screen === "generating"} onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
      ) : null}
      {content}
    </div>
  );
}

export default Prototype;
