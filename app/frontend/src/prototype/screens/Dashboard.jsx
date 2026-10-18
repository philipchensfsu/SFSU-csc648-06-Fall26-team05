import { useEffect, useState } from "react";
import Dialog from "../Dialog";
import { formatDate, STATUS_LABELS } from "../data";

const STATUSES = Object.keys(STATUS_LABELS);
const SEARCH_DEBOUNCE_MS = 300;

function Dashboard({
  prds,
  projects,
  projectsError,
  prdsError,
  onCreatePrd,
  onSearch,
  onOpen,
  onDelete,
  onCreateProject,
}) {
  // "all", "none" (no project), or a project id.
  const [projectFilter, setProjectFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Text search runs on the server (title + content_text, GET
  // /api/prds?search=). Runs immediately on mount -- that's what loads the
  // list -- then debounced while typing. `onSearch` must be stable (it's
  // useCallback'd in Prototype), or this would re-fetch every render.
  useEffect(() => {
    const term = query.trim();
    const handle = setTimeout(() => onSearch(term), term ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(handle);
  }, [query, onSearch]);

  const projectName = (id) =>
    projects.find((project) => project.id === id)?.name ?? "No project";

  // Project and status filters stay client-side over the search results.
  const visible = prds.filter((prd) => {
    if (projectFilter === "none" && prd.projectId) return false;
    if (
      projectFilter !== "all" &&
      projectFilter !== "none" &&
      prd.projectId !== projectFilter
    ) {
      return false;
    }
    return !status || prd.status === status;
  });

  function handleCreateProject(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onCreateProject({
      name: form.get("projectName").trim(),
      description: form.get("projectDescription").trim(),
    });
    event.currentTarget.reset();
    setShowNewProject(false);
  }

  let body;
  // With server-side search, an empty list during a search means "no
  // matches", not "no PRDs yet".
  if (prds.length === 0 && !query.trim()) {
    body = (
      <div className="nt-empty">
        <h2>No PRDs yet</h2>
        <p>
          A PRD is a product requirements document. Create one and answer a few
          guided questions to get an AI-drafted version.
        </p>
        <button type="button" className="nt-btn nt-btn-primary" onClick={onCreatePrd}>
          Create PRD
        </button>
      </div>
    );
  } else if (visible.length === 0) {
    body = (
      <div className="nt-empty">
        <h2>
          {query ? <>No PRDs match &ldquo;{query}&rdquo;</> : "No PRDs match these filters"}
        </h2>
        <p>Check the spelling or try a different word.</p>
        <button
          type="button"
          className="nt-btn nt-btn-secondary"
          onClick={() => {
            setQuery("");
            setStatus("");
          }}
        >
          Clear search
        </button>
      </div>
    );
  } else {
    body = (
      <table className="nt-table">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Project</th>
            <th scope="col">Status</th>
            <th scope="col">Last modified</th>
            <th scope="col">
              <span className="nt-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((prd) => (
            <tr key={prd.id}>
              <th scope="row">{prd.title}</th>
              <td>{projectName(prd.projectId)}</td>
              <td>
                <span className={`nt-status nt-status-${prd.status}`}>
                  {STATUS_LABELS[prd.status] ?? prd.status}
                </span>
              </td>
              <td>{formatDate(prd.modified)}</td>
              <td>
                <div className="nt-row-actions">
                  <button
                    type="button"
                    className="nt-btn nt-btn-secondary nt-btn-sm"
                    onClick={() => onOpen(prd)}
                    aria-label={`Open ${prd.title}`}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="nt-btn nt-btn-danger-ghost nt-btn-sm"
                    onClick={() => setPendingDelete(prd)}
                    aria-label={`Delete ${prd.title}`}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="nt-layout">
      <nav className="nt-sidebar" aria-label="PRD folders">
        <SidebarItem
          active={projectFilter === "all"}
          onClick={() => setProjectFilter("all")}
        >
          All PRDs
        </SidebarItem>
        <p className="nt-sidebar-heading">Projects</p>
        {projects.map((project) => (
          <SidebarItem
            key={project.id}
            active={projectFilter === project.id}
            onClick={() => setProjectFilter(project.id)}
          >
            {project.name}
          </SidebarItem>
        ))}
        <SidebarItem
          active={projectFilter === "none"}
          onClick={() => setProjectFilter("none")}
        >
          No project
        </SidebarItem>
      </nav>

      <main className="nt-main">
        {projectsError ? (
          <p className="nt-error" role="alert">
            Couldn&apos;t load your projects from the server: {projectsError}
          </p>
        ) : null}
        {prdsError ? (
          <p className="nt-error" role="alert">
            {prdsError}
          </p>
        ) : null}
        <div className="nt-page-head">
          <div>
            <h1>Your PRDs</h1>
            <p className="nt-muted">
              A project is an optional folder for PRDs. A PRD can also exist on
              its own.
            </p>
          </div>
          <div className="nt-actions">
            <button
              type="button"
              className="nt-btn nt-btn-secondary"
              onClick={() => setShowNewProject(true)}
            >
              New project
            </button>
            <button type="button" className="nt-btn nt-btn-primary" onClick={onCreatePrd}>
              Create PRD
            </button>
          </div>
        </div>

        <div className="nt-filters">
          <label className="nt-search">
            <span className="nt-sr-only">Search PRDs</span>
            <input
              type="search"
              placeholder="Search PRDs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span className="nt-sr-only">Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Status: all</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="nt-card nt-table-card">{body}</div>
        <p className="nt-footnote">PRDs are saved to your account.</p>
      </main>

      <Dialog
        open={showNewProject}
        title="New project"
        onClose={() => setShowNewProject(false)}
      >
        <p className="nt-muted">
          A project is an optional folder that groups PRDs. It does not start an
          interview.
        </p>
        <form onSubmit={handleCreateProject}>
          <div className="nt-field">
            <label htmlFor="projectName">
              Project name <span className="nt-req">(Required)</span>
            </label>
            <input id="projectName" name="projectName" required />
          </div>
          <div className="nt-field">
            <label htmlFor="projectDescription">
              One-line description <span className="nt-req">(Optional)</span>
            </label>
            <input id="projectDescription" name="projectDescription" />
          </div>
          <div className="nt-dialog-actions">
            <button
              type="button"
              className="nt-btn nt-btn-secondary"
              onClick={() => setShowNewProject(false)}
            >
              Cancel
            </button>
            <button type="submit" className="nt-btn nt-btn-primary">
              Create project
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete “${pendingDelete.title}”?` : ""}
        onClose={() => setPendingDelete(null)}
      >
        <p>This can&apos;t be undone.</p>
        <div className="nt-dialog-actions">
          <button
            type="button"
            className="nt-btn nt-btn-secondary"
            onClick={() => setPendingDelete(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nt-btn nt-btn-danger"
            onClick={() => {
              onDelete(pendingDelete.id);
              setPendingDelete(null);
            }}
          >
            Delete
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function SidebarItem({ active, onClick, children }) {
  return (
    <button
      type="button"
      className={`nt-sidebar-item${active ? " is-active" : ""}`}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default Dashboard;
