import { useCallback, useEffect, useMemo, useState } from "react";
import "./workspace.css";
import DashboardPage from "./DashboardPage";
import PeoplePage from "./PeoplePage";
import ProjectsPage from "./ProjectsPage";
import SearchPage from "./SearchPage";
import Sidebar from "./Sidebar";
import { searchShortcutLabel } from "./format";
import { Alert } from "./ui";

const PAGE_TITLES = { dashboard: "Dashboard", projects: "Projects", search: "Search", people: "People" };

// The signed-in home: sidebar plus the dashboard, a project, or search.
// It holds no data of its own; Prototype.jsx passes the real PRDs and
// projects from the API and the handlers that change them.
//
// view: { page: "dashboard" | "projects" | "search", projectId?, query?,
//         anchor?: "prds", visit } — `visit` changes on every navigation.
function Workspace({
  view,
  account,
  organization,
  userId,
  prds,
  prdsLoaded,
  prdsError,
  projects,
  projectsLoaded,
  projectsError,
  questions,
  onRefresh,
  onNavigate,
  onQueryChange,
  onCreatePrd,
  onOpenPrd,
  onRenamePrd,
  onDeletePrd,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onCountProjectPrds,
  onSearchPrds,
  onLoadAnswers,
  onDismissError,
  onSignOut,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcut] = useState(searchShortcutLabel);
  const { page } = view;

  // Newest first everywhere: the table, the cards and Recent.
  const sorted = useMemo(
    () => [...prds].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [prds],
  );

  const go = useCallback(
    (next) => {
      setMenuOpen(false);
      onNavigate(next);
    },
    [onNavigate],
  );

  // Fresh data whenever the workspace is shown (e.g. back from the editor)
  // and on every move between its pages.
  useEffect(() => {
    onRefresh();
  }, [onRefresh, view.visit]);

  useEffect(() => {
    document.title = `Nautilus — ${PAGE_TITLES[page] ?? "Dashboard"}`;
  }, [page]);
  useEffect(
    () => () => {
      document.title = "Nautilus";
    },
    [],
  );

  // A new page starts at the top; "PRDs" in the sidebar jumps to the table
  // once it has loaded.
  useEffect(() => {
    if (view.anchor !== "prds") window.scrollTo(0, 0);
  }, [view.visit, view.anchor]);
  useEffect(() => {
    if (view.anchor === "prds" && prdsLoaded) {
      document.getElementById("nw-prds")?.scrollIntoView({ block: "start" });
    }
  }, [view.visit, view.anchor, prdsLoaded]);

  // ⌘K / Ctrl+K opens search from anywhere in the workspace.
  useEffect(() => {
    function onKeyDown(event) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key?.toLowerCase() !== "k" || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      if (page === "search") document.getElementById("nw-q")?.focus();
      else go({ page: "search", query: "" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [page, go]);

  let content;
  if (page === "people" && organization?.access_role === "admin") {
    content = <PeoplePage organization={organization} userId={userId} />;
  } else if (page === "projects") {
    content = (
      <ProjectsPage
        account={account}
        userId={userId}
        prds={sorted}
        prdsLoaded={prdsLoaded}
        projects={projects}
        projectsLoaded={projectsLoaded}
        selectedId={view.projectId ?? null}
        questions={questions}
        onSelect={(projectId) => go({ page: "projects", projectId })}
        onCreatePrd={onCreatePrd}
        onOpenPrd={onOpenPrd}
        onLoadAnswers={onLoadAnswers}
        onCreateProject={onCreateProject}
        onRenameProject={onRenameProject}
        onDeleteProject={onDeleteProject}
        onCountProjectPrds={onCountProjectPrds}
      />
    );
  } else if (page === "search") {
    content = (
      <SearchPage
        query={view.query ?? ""}
        prds={sorted}
        projects={projects}
        onQueryChange={onQueryChange}
        onSearchPrds={onSearchPrds}
        onOpenPrd={onOpenPrd}
        onOpenProject={(projectId) => go({ page: "projects", projectId })}
      />
    );
  } else {
    content = (
      <DashboardPage
        account={account}
        organization={organization}
        prds={sorted}
        prdsLoaded={prdsLoaded}
        projects={projects}
        questions={questions}
        shortcut={shortcut}
        onNavigate={go}
        onCreatePrd={onCreatePrd}
        onOpenPrd={onOpenPrd}
        onLoadAnswers={onLoadAnswers}
        onRenamePrd={onRenamePrd}
        onDeletePrd={onDeletePrd}
      />
    );
  }

  const error = prdsError || projectsError;

  return (
    <div className="nw-root nw-app">
      <button
        type="button"
        className="nw-skip"
        onClick={() => document.getElementById("nw-main")?.focus()}
      >
        Skip to content
      </button>
      <Sidebar
        page={page}
        account={account}
        organization={organization}
        prdCount={prdsLoaded ? prds.length : undefined}
        projectCount={projectsLoaded ? projects.length : undefined}
        recent={sorted.slice(0, 3)}
        shortcut={shortcut}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onNavigate={go}
        onCreatePrd={onCreatePrd}
        onOpenPrd={onOpenPrd}
        onSignOut={onSignOut}
      />
      <main className="nw-main" id="nw-main" tabIndex={-1}>
        {error ? (
          <div className="nw-alert-wrap">
            <Alert onRetry={onRefresh} onDismiss={onDismissError}>
              <strong>Something went wrong.</strong> {error}
            </Alert>
          </div>
        ) : null}
        {content}
      </main>
    </div>
  );
}

export default Workspace;
