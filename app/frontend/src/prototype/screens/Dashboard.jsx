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
  onRenameProject,
  onDeleteProject,
  onCountProjectPrds,
}) {
  // "all", "none" (no project), or a project id.
  const [projectFilter, setProjectFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameError, setRenameError] = useState(null);
  const [renameBusy, setRenameBusy] = useState(false);
  // count stays null until a full (unsearched) PRD list comes back. The
  // on-screen list can be a search result, so it can't be used for the
  // "how many PRDs will be deleted" confirmation.
  const [pendingProjectDelete, setPendingProjectDelete] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    if (!openMenuId) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setOpenMenuId(null);
    }
    function onMouseDown(event) {
      if (event.target.closest?.("[data-project-menu]")) return;
      setOpenMenuId(null);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [openMenuId]);

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
    onCreateProject(form.get("projectName").trim());
    event.currentTarget.reset();
    setShowNewProject(false);
  }

  function startRename(project) {
    setRenameError(null);
    setRenaming(project);
  }

  function handleRename(event) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("projectName").trim();
    if (name === renaming.name) {
      setRenaming(null);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    onRenameProject(renaming.id, name)
      .then(() => setRenaming(null))
      .catch((error) => setRenameError(error.message))
      .finally(() => setRenameBusy(false));
  }

  function askDeleteProject(project) {
    setPendingProjectDelete({ project, count: null, error: null, busy: false });
    onCountProjectPrds()
      .then((rows) => {
        const count = rows.filter((row) => row.project_id === project.id).length;
        setPendingProjectDelete((current) =>
          current?.project.id === project.id ? { ...current, count } : current,
        );
      })
      .catch((error) => {
        setPendingProjectDelete((current) =>
          current?.project.id === project.id
            ? { ...current, error: error.message }
            : current,
        );
      });
  }

  function confirmDeleteProject() {
    const { project } = pendingProjectDelete;
    setPendingProjectDelete((current) => ({ ...current, busy: true, error: null }));
    onDeleteProject(project.id)
      .then(() => {
        if (projectFilter === project.id) setProjectFilter("all");
        setPendingProjectDelete(null);
      })
      .catch((error) =>
        setPendingProjectDelete((current) =>
          current ? { ...current, busy: false, error: error.message } : current,
        ),
      );
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
        {projects.map((project) => {
          const menuOpen = openMenuId === project.id;
          const selected = projectFilter === project.id;
          return (
            <div
              key={project.id}
              className={`nt-project-row${selected ? " is-active" : ""}`}
            >
              <SidebarItem
                active={selected}
                onClick={() => {
                  setOpenMenuId(null);
                  setProjectFilter(project.id);
                }}
              >
                {project.name}
              </SidebarItem>
              <div className="nt-project-menu" data-project-menu>
                <button
                  type="button"
                  className="nt-project-more"
                  aria-label={`Actions for ${project.name}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setOpenMenuId(menuOpen ? null : project.id)}
                >
                  ···
                </button>
                {menuOpen ? (
                  <div className="nt-project-menu-panel" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        startRename(project);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      onClick={() => {
                        setOpenMenuId(null);
                        askDeleteProject(project);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
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
            <input id="projectName" name="projectName" maxLength={200} required />
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

      <Dialog
        open={renaming !== null}
        title={renaming ? `Rename “${renaming.name}”` : ""}
        onClose={() => {
          if (!renameBusy) setRenaming(null);
        }}
      >
        <form key={renaming?.id ?? "rename"} onSubmit={handleRename}>
          <div className="nt-field">
            <label htmlFor="renameProjectName">
              Project name <span className="nt-req">(Required)</span>
            </label>
            <input
              id="renameProjectName"
              name="projectName"
              defaultValue={renaming?.name ?? ""}
              maxLength={200}
              required
            />
          </div>
          {renameError ? (
            <p className="nt-error" role="alert">
              {renameError}
            </p>
          ) : null}
          <div className="nt-dialog-actions">
            <button
              type="button"
              className="nt-btn nt-btn-secondary"
              disabled={renameBusy}
              onClick={() => setRenaming(null)}
            >
              Cancel
            </button>
            <button type="submit" className="nt-btn nt-btn-primary" disabled={renameBusy}>
              {renameBusy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={pendingProjectDelete !== null}
        title={
          pendingProjectDelete
            ? `Delete “${pendingProjectDelete.project.name}”?`
            : ""
        }
        onClose={() => {
          if (!pendingProjectDelete?.busy) setPendingProjectDelete(null);
        }}
      >
        <p>
          {!pendingProjectDelete || pendingProjectDelete.count === null
            ? pendingProjectDelete?.error
              ? "Couldn't check how many PRDs would be deleted."
              : "Checking how many PRDs this will delete…"
            : projectDeleteMessage(pendingProjectDelete.count)}
        </p>
        {pendingProjectDelete?.error ? (
          <p className="nt-error" role="alert">
            {pendingProjectDelete.error}
          </p>
        ) : null}
        <div className="nt-dialog-actions">
          <button
            type="button"
            className="nt-btn nt-btn-secondary"
            disabled={pendingProjectDelete?.busy}
            onClick={() => setPendingProjectDelete(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nt-btn nt-btn-danger"
            disabled={
              !pendingProjectDelete ||
              pendingProjectDelete.busy ||
              pendingProjectDelete.count === null
            }
            onClick={confirmDeleteProject}
          >
            {pendingProjectDelete?.busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function projectDeleteMessage(count) {
  const noun = count === 1 ? "PRD" : "PRDs";
  return `This permanently deletes this project and ${count} ${noun} inside it. This can't be undone.`;
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
