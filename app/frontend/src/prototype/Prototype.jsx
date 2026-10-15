import { useState } from "react";
import "./prototype.css";
import {
  INITIAL_PRDS,
  INITIAL_PROJECTS,
  SAMPLE_ANSWERS,
  draftSectionsFromAnswers,
  today,
} from "./data";
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
  const [prds, setPrds] = useState(INITIAL_PRDS);
  const [projects, setProjects] = useState(INITIAL_PROJECTS);
  const [activePrdId, setActivePrdId] = useState(null);
  const [failGeneration, setFailGeneration] = useState(false);

  const activePrd = prds.find((prd) => prd.id === activePrdId) ?? null;

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
    const id = `d${Date.now()}`;
    setPrds((current) => [
      {
        id,
        title,
        projectId,
        status: "Draft",
        modified: today(),
        answers: {},
        sections: null,
      },
      ...current,
    ]);
    go("interview", id);
  }

  function openPrd(prd) {
    go(prd.sections ? "editor" : "interview", prd.id);
  }

  function finishGeneration() {
    updatePrd(activePrd.id, {
      status: "Generated",
      sections: draftSectionsFromAnswers(activePrd.answers),
    });
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
        onChange={(answers) => updatePrd(activePrd.id, { answers })}
        onDone={() => go("review")}
        onSaveForLater={() => go("dashboard", null)}
      />
    );
  } else if (screen === "review" && activePrd) {
    content = (
      <Review
        prd={activePrd}
        onChange={(answers) => updatePrd(activePrd.id, { answers })}
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
        onSave={(sections) =>
          updatePrd(activePrd.id, { sections, status: "Updated" })
        }
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
        onOpen={openPrd}
        onDelete={(id) =>
          setPrds((current) => current.filter((prd) => prd.id !== id))
        }
        onCreateProject={(project) =>
          setProjects((current) => [
            ...current,
            { id: `p${Date.now()}`, ...project },
          ])
        }
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
