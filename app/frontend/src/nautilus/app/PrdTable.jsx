import { useMemo, useState } from "react";
import { ConfirmDialog, NameDialog } from "./dialogs";
import { STATUS_ORDER, formatDay, prdSummary, statusLabel } from "./format";
import { IconFolder, IconMore, IconOpen, IconPencil, IconTrash } from "./icons";
import { MenuButton, StatusChip } from "./ui";

// Every PRD the person can see, newest first, with status filters and a
// menu per row to open, rename or delete it.
function PrdTable({ prds, projects, onOpenPrd, onOpenProject, onRenamePrd, onDeletePrd }) {
  const [status, setStatus] = useState("all");
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const counts = useMemo(() => {
    const result = {};
    prds.forEach((prd) => {
      result[prd.status] = (result[prd.status] ?? 0) + 1;
    });
    return result;
  }, [prds]);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const shown = status === "all" ? prds : prds.filter((prd) => prd.status === status);
  // Only statuses someone actually has get a filter (plus the selected one,
  // so it doesn't vanish under the pointer when its last PRD is deleted).
  const filters = STATUS_ORDER.filter((value) => counts[value] || value === status);

  return (
    <section id="nw-prds" className="nw-section" aria-labelledby="nw-prds-h">
      <div className="nw-section-head">
        <h2 id="nw-prds-h" className="nw-h2">
          PRDs
        </h2>
        <div className="nw-filters" role="group" aria-label="Filter by status">
          <button
            type="button"
            className="nw-filter"
            aria-pressed={status === "all"}
            onClick={() => setStatus("all")}
          >
            All · {prds.length}
          </button>
          {filters.map((value) => (
            <button
              key={value}
              type="button"
              className="nw-filter"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {statusLabel(value)} · {counts[value] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div className="nw-table-card">
        <table className="nw-table">
          <thead>
            <tr>
              <th scope="col">PRD</th>
              <th scope="col">Project</th>
              <th scope="col">Status</th>
              <th scope="col" aria-sort="descending">
                Updated <span aria-hidden="true">↓</span>
              </th>
              <th scope="col">
                <span className="nw-sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="nw-table-empty">
                  No PRDs with this status.
                </td>
              </tr>
            ) : null}
            {shown.map((prd) => {
              const project = prd.projectId ? projectById.get(prd.projectId) : null;
              const summary = prdSummary(prd);
              return (
                <tr key={prd.id}>
                  <td>
                    <button type="button" className="nw-row-title" onClick={() => onOpenPrd(prd)}>
                      {prd.title}
                    </button>
                    {summary ? <div className="nw-row-sub">{summary}</div> : null}
                  </td>
                  <td className="nw-nowrap">
                    {project ? (
                      <button type="button" className="nw-row-project" onClick={() => onOpenProject(project.id)}>
                        <IconFolder size={15} />
                        {project.name}
                      </button>
                    ) : (
                      <span className="nw-muted">No project</span>
                    )}
                  </td>
                  <td>
                    <StatusChip status={prd.status} reviewState={prd.reviewState} />
                  </td>
                  <td className="nw-nowrap nw-row-date">{formatDay(prd.updatedAt)}</td>
                  <td className="nw-row-actions">
                    <MenuButton
                      label={`More actions for ${prd.title}`}
                      className="nw-icon-btn nw-more"
                      items={[
                        { label: "Open", icon: <IconOpen />, onSelect: () => onOpenPrd(prd) },
                        { label: "Rename", icon: <IconPencil />, onSelect: () => setRenaming(prd) },
                        { label: "Delete", icon: <IconTrash />, danger: true, onSelect: () => setDeleting(prd) },
                      ]}
                    >
                      <IconMore />
                    </MenuButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <NameDialog
        open={renaming !== null}
        title="Rename PRD"
        label="PRD title"
        initialValue={renaming?.title ?? ""}
        submitLabel="Save"
        onSubmit={(title) => onRenamePrd(renaming, title)}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete “${deleting.title}”?` : "Delete PRD?"}
        onConfirm={() => onDeletePrd(deleting)}
        onClose={() => setDeleting(null)}
      >
        <p>This permanently deletes the PRD and its interview answers. It can’t be undone.</p>
      </ConfirmDialog>
    </section>
  );
}

export default PrdTable;
