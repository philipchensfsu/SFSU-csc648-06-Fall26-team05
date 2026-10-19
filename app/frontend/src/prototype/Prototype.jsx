import { useCallback, useEffect, useRef, useState } from "react";
import "./prototype.css";
import {
  INITIAL_PRDS,
  INITIAL_PROJECTS,
  SAMPLE_ANSWERS,
  draftSectionsFromAnswers,
  fromApiIntakeAnswers,
  fromApiPrd,
  sectionsToContentJson,
  sectionsToText,
  today,
} from "./data";
import { api } from "../../lib/api";
import SignIn from "../components/SignIn";
import Dashboard from "./screens/Dashboard";
import CreatePrd from "./screens/CreatePrd";
import Interview from "./screens/Interview";
import Review from "./screens/Review";
import Generating from "./screens/Generating";
import Editor from "./screens/Editor";
import ExportPrd from "./screens/ExportPrd";
import ScreenJumper from "./ScreenJumper";

// `initialUser` skips the sign-in screen when someone is already logged in;
// `onLogOut` lets the app sign them out for real instead of just resetting.
function Prototype({ initialUser = null, onLogOut }) {
  const [user, setUser] = useState(initialUser);
  const [screen, setScreen] = useState(initialUser ? "dashboard" : "signin");
  // Start empty rather than with mock data, so a real user never sees (or
  // clicks) placeholder PRDs before the API responds.
  const [prds, setPrds] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activePrdId, setActivePrdId] = useState(null);
  const [failGeneration, setFailGeneration] = useState(false);
  const [projectsError, setProjectsError] = useState(null);
  const [prdsError, setPrdsError] = useState(null);
  const latestSearch = useRef(0);

  const activePrd = prds.find((prd) => prd.id === activePrdId) ?? null;

  // PRDs aren't loaded here: the Dashboard runs a search (empty = all) every
  // time it's shown, which also keeps the list fresh after editing.
  useEffect(() => {
    if (!user) return;
    api
      .listProjects()
      .then((real) => setProjects(real))
      .catch((error) => setProjectsError(error.message));
  }, [user]);

  // Stable identity (only touches setters and a ref), so Dashboard can list
  // it as an effect dependency without re-fetching on every render.
  const searchPrds = useCallback((query) => {
    // Ignore responses that arrive after a newer search was started, so a
    // slow early request can't overwrite the results of a later one.
    const requestId = ++latestSearch.current;
    api
      .listPrds(query)
      .then((real) => {
        if (requestId === latestSearch.current) setPrds(real.map(fromApiPrd));
      })
      .catch((error) => setPrdsError(error.message));
  }, []);

  function go(nextScreen, prdId = activePrdId) {
    setActivePrdId(prdId);
    setScreen(nextScreen);
    window.scrollTo(0, 0);
  }

  function updatePrd(id, changes) {
    setPrds((current) =>
      current.map((prd) =>
        prd.id === id ? { ...prd, ...changes, modified: today() } : prd,
      ),
    );
  }

  function signIn(email) {
    setUser(email);
    go("dashboard", null);
  }

  function signOut() {
    if (onLogOut) {
      onLogOut();
      return;
    }
    setUser(null);
    go("signin", null);
  }

  function createPrd({ title, projectId }) {
    api
      .createPrd(title, projectId)
      .then((created) => {
        const prd = fromApiPrd(created);
        setPrds((current) => [prd, ...current]);
        go("interview", prd.id);
      })
      .catch((error) => setPrdsError(error.message));
  }

  function openPrd(prd) {
    if (prd.sections) {
      go("editor", prd.id);
      return;
    }
    // Load saved answers *before* showing the wizard: Interview picks its
    // starting question from `answers` once, on mount.
    api
      .listIntakeAnswers(prd.id)
      .then((rows) => {
        const answers = fromApiIntakeAnswers(rows);
        setPrds((current) =>
          current.map((p) => (p.id === prd.id ? { ...p, answers } : p)),
        );
      })
      .catch((error) => setPrdsError(error.message))
      .finally(() => go("interview", prd.id));
  }

  // Interview and Review both hand back the full answers object with one
  // key changed; persist just the keys that differ (Section 1.6: "each
  // answer is saved as soon as it is submitted").
  function saveAnswers(prd, nextAnswers) {
    const changed = Object.keys(nextAnswers).filter(
      (key) => nextAnswers[key] !== prd.answers[key],
    );
    updatePrd(prd.id, { answers: nextAnswers });
    changed.forEach((key) =>
      api
        .saveIntakeAnswer(prd.id, key, nextAnswers[key])
        .catch((error) => setPrdsError(error.message)),
    );
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
        content_json: sectionsToContentJson(sections),
        content_text: sectionsToText(sections),
        status,
      })
      .then((saved) => {
        setPrds((current) =>
          current.map((p) =>
            p.id === id ? { ...fromApiPrd(saved), answers: p.answers } : p,
          ),
        );
      });
  }

  function finishGeneration() {
    const sections = draftSectionsFromAnswers(activePrd.answers);
    // Update the UI immediately rather than waiting on the network, then
    // persist in the background; a failure surfaces via prdsError without
    // blocking the screen transition.
    updatePrd(activePrd.id, { status: "in_review", sections });
    savePrdContent(activePrd.id, sections, "in_review").catch((error) =>
      setPrdsError(error.message),
    );
    go("ready");
  }

  function jumpTo(target) {
    const email = user ?? "student@sfsu.edu";
    if (target === "signin") {
      setUser(null);
      go(target, null);
      return;
    }
    setUser(email);
    if (target === "dashboard-empty") {
      setPrds([]);
      go("dashboard", null);
      return;
    }
    if (target === "reset") {
      setPrds(INITIAL_PRDS);
      setProjects(INITIAL_PROJECTS);
      go("dashboard", null);
      return;
    }
    if (target === "dashboard" || target === "create") {
      go(target, null);
      return;
    }
    // Everything else needs a PRD; use the sample one.
    const sample = prds.find((prd) => prd.sections) ?? INITIAL_PRDS[0];
    if (!prds.some((prd) => prd.id === sample.id)) {
      setPrds((current) => [sample, ...current]);
    }
    if (target === "interview" || target === "review") {
      updatePrd(sample.id, { answers: SAMPLE_ANSWERS });
    }
    go(target, sample.id);
  }

  let content;
  if (!user) {
    content = <SignIn onSignIn={signIn} />;
  } else if (screen === "create") {
    content = (
      <CreatePrd
        projects={projects}
        onCreate={createPrd}
        onCancel={() => go("dashboard", null)}
      />
    );
  } else if (screen === "interview" && activePrd) {
    content = (
      <Interview
        prd={activePrd}
        onChange={(answers) => saveAnswers(activePrd, answers)}
        onDone={() => go("review")}
        onSaveForLater={() => go("dashboard", null)}
      />
    );
  } else if (screen === "review" && activePrd) {
    content = (
      <Review
        prd={activePrd}
        onChange={(answers) => saveAnswers(activePrd, answers)}
        onBack={() => go("interview")}
        onGenerate={() => go("generating")}
      />
    );
  } else if ((screen === "generating" || screen === "ready") && activePrd) {
    content = (
      <Generating
        key={screen}
        prd={activePrd}
        done={screen === "ready"}
        shouldFail={failGeneration}
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
        onDashboard={() => go("dashboard", null)}
        onExport={() => go("export")}
      />
    );
  } else if (screen === "export" && activePrd?.sections) {
    content = <ExportPrd prd={activePrd} onBack={() => go("editor")} />;
  } else {
    content = (
      <Dashboard
        prds={prds}
        projects={projects}
        onCreatePrd={() => go("create", null)}
        onSearch={searchPrds}
        onOpen={openPrd}
        onDelete={(id) =>
          api
            .deletePrd(id)
            .then(() =>
              setPrds((current) => current.filter((prd) => prd.id !== id)),
            )
            .catch((error) => setPrdsError(error.message))
        }
        projectsError={projectsError}
        prdsError={prdsError}
        onCreateProject={(name) =>
          api
            .createProject(name)
            .then((created) => setProjects((current) => [...current, created]))
            .catch((error) => setProjectsError(error.message))
        }
        onRenameProject={(id, name) =>
          api.renameProject(id, name).then((updated) => {
            setProjects((current) =>
              current.map((project) => (project.id === id ? updated : project)),
            );
          })
        }
        onDeleteProject={(id) =>
          api.deleteProject(id).then(() => {
            setProjects((current) => current.filter((project) => project.id !== id));
            setPrds((current) => current.filter((prd) => prd.projectId !== id));
          })
        }
        onCountProjectPrds={() => api.listPrds()}
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
            onClick={() => go("dashboard", null)}
          >
            Nautilus
          </button>
          <div className="nt-header-user">
            <span>{user}</span>
            <button type="button" className="nt-btn nt-btn-ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        </header>
      ) : null}
      {content}
      {/* Development-only shortcut panel; stripped from production builds. */}
      {import.meta.env.DEV ? (
        <ScreenJumper
          failGeneration={failGeneration}
          onToggleFail={setFailGeneration}
          onJump={jumpTo}
        />
      ) : null}
    </div>
  );
}

export default Prototype;
