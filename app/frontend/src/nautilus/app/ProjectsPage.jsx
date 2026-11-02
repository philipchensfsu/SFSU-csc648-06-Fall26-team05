import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog, NameDialog } from "./dialogs";
import {
  assumptionCount,
  formatDate,
  formatDay,
  initialsOf,
  interviewProgress,
  plural,
  prdSummary,
} from "./format";
import { IconDoc, IconFolder, IconPencil, IconPlus, IconTrash } from "./icons";
import { Avatar, InterviewMeter, StatusChip } from "./ui";

// The id used for PRDs that aren't in any project.
const NO_PROJECT = "none";

function PrdCard({ prd, account, userId, questions, onOpenPrd }) {
  const generated = Boolean(prd.sections);
  const progress = generated ? null : interviewProgress(prd, questions);
  const summary = prdSummary(prd);
  const assumptions = generated ? assumptionCount(prd) : 0;
  // RLS lets admins and engineers see PRDs owned by other people, whose
  // names the API doesn't return.
  const mine = !userId || prd.ownerId === userId;
  return (
    <article className="nw-pcard">
      <div className="nw-card-head">
        <StatusChip status={prd.status} reviewState={prd.reviewState} />
        <span className="nw-card-date">{formatDay(prd.updatedAt)}</span>
      </div>
      <div>
        <h3 className="nw-card-title">
          <button type="button" className="nw-pcard-link" onClick={() => onOpenPrd(prd)}>
            {prd.title}
          </button>
        </h3>
        {summary ? <p className="nw-card-text">{summary}</p> : null}
      </div>
      {generated ? (
        <p className="nw-card-meta">
          <IconDoc size={16} />
          {plural(prd.sections.length, "section")}
          {assumptions ? ` · ${plural(assumptions, "assumption")} to check` : ""}
        </p>
      ) : (
        <InterviewMeter progress={progress} total={questions.length} />
      )}
      <div className="nw-pcard-foot">
        {mine ? (
          <span className="nw-owner">
            <Avatar initials={initialsOf(account.name, account.email)} />
            {account.name || "You"}
          </span>
        ) : (
          <span className="nw-owner nw-muted">Shared with you</span>
        )}
        <button type="button" className="nw-text-btn" onClick={() => onOpenPrd(prd)}>
          {generated ? "Open" : "Continue"}
        </button>
      </div>
    </article>
  );
}

function ProjectsPage({
  account,
  userId,
  prds,
  prdsLoaded,
  projects,
  projectsLoaded,
  selectedId,
  questions,
  onSelect,
  onCreatePrd,
  onOpenPrd,
  onLoadAnswers,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onCountProjectPrds,
}) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // { project, count, countError } where count is null until the API has answered.
  const [deleting, setDeleting] = useState(null);

  const sorted = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects],
  );
  const counts = useMemo(() => {
    const result = {};
    prds.forEach((prd) => {
      const key = prd.projectId ?? NO_PROJECT;
      result[key] = (result[key] ?? 0) + 1;
    });
    return result;
  }, [prds]);

  // With nothing chosen (or a project that was just deleted), show the first project.
  let currentId = selectedId;
  if (currentId !== NO_PROJECT && !sorted.some((project) => project.id === currentId)) {
    currentId = sorted[0]?.id ?? NO_PROJECT;
  }
  const project = sorted.find((item) => item.id === currentId) ?? null;
  const inView = useMemo(
    () => prds.filter((prd) => (prd.projectId ?? NO_PROJECT) === currentId),
    [prds, currentId],
  );

  const needAnswers = inView
    .filter((prd) => !prd.sections && !prd.answersLoaded)
    .slice(0, 12)
    .map((prd) => prd.id)
    .join(",");
  useEffect(() => {
    if (needAnswers) onLoadAnswers(needAnswers.split(","));
  }, [needAnswers, onLoadAnswers]);

  function askDelete() {
    const target = project;
    setDeleting({ project: target, count: null, countError: "" });
    // Count on the server: the list here may be a few seconds old.
    onCountProjectPrds(target.id)
      .then((count) =>
        setDeleting((current) => (current?.project.id === target.id ? { ...current, count } : current)),
      )
      .catch(() =>
        setDeleting((current) =>
          current?.project.id === target.id
            ? { ...current, countError: "Couldn’t check the current PRD count. Close this dialog and try again." }
            : current,
        ),
      );
  }

  if (!projectsLoaded || !prdsLoaded) {
    return (
      <div className="nw-page">
        <p className="nw-loading" role="status">
          Loading your projects…
        </p>
      </div>
    );
  }

  const noProjectCount = counts[NO_PROJECT] ?? 0;
  const dialogs = (
    <>
      <NameDialog
        open={creating}
        title="New project"
        label="Project name"
        hint="A project is a folder for related PRDs."
        submitLabel="Create project"
        busyLabel="Creating…"
        onSubmit={(name) => onCreateProject(name).then((created) => onSelect(created.id))}
        onClose={() => setCreating(false)}
      />
      <NameDialog
        open={renaming}
        title="Rename project"
        label="Project name"
        initialValue={project?.name ?? ""}
        submitLabel="Save"
        onSubmit={(name) => onRenameProject(project.id, name)}
        onClose={() => setRenaming(false)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete “${deleting.project.name}”?` : "Delete project?"}
        ready={deleting?.count != null}
        onConfirm={() => onDeleteProject(deleting.project.id)}
        onClose={() => setDeleting(null)}
      >
        <p>
          {deleting?.countError
            ? deleting.countError
            : deleting?.count == null
            ? "Checking how many PRDs are in it…"
            : deleting.count === 0
              ? "The project is empty. This can’t be undone."
              : `This also permanently deletes the ${plural(deleting.count, "PRD")} in it. This can’t be undone.`}
        </p>
      </ConfirmDialog>
    </>
  );

  // Nobody has made a project or a PRD yet.
  if (sorted.length === 0 && noProjectCount === 0) {
    return (
      <div className="nw-page">
        <h1 className="nw-h1">Projects</h1>
        <section className="nw-blank">
          <span className="nw-blank-icon">
            <IconFolder size={24} />
          </span>
          <h2 className="nw-blank-title">No projects yet</h2>
          <p className="nw-blank-text">Projects are folders for related PRDs. A PRD can also live on its own.</p>
          <button type="button" className="nw-btn nw-btn-primary" onClick={() => setCreating(true)}>
            <IconPlus size={16} />
            New project
          </button>
        </section>
        {dialogs}
      </div>
    );
  }

  const title = project ? project.name : "No project";
  let meta = `${plural(inView.length, "PRD")} that aren’t in a project`;
  if (inView.length === 1 && !project) meta = "1 PRD that isn’t in a project";
  if (project) meta = `${plural(inView.length, "PRD")} · created ${formatDate(project.created_at)}`;

  return (
    <div className="nw-page">
      <div className="nw-proj-top">
        <nav aria-label="Breadcrumb" className="nw-crumbs">
          <span className="nw-crumb">Projects</span>
          <span aria-hidden="true" className="nw-crumb-sep">
            /
          </span>
          <span className="nw-crumb-current" aria-current="page">
            {title}
          </span>
        </nav>
        <div className="nw-proj-head">
          <div className="nw-proj-name">
            <span className="nw-proj-icon">
              <IconFolder size={24} />
            </span>
            <div>
              <h1 className="nw-h1">{title}</h1>
              <p className="nw-lede">{meta}</p>
            </div>
          </div>
          <div className="nw-proj-actions">
            {project ? (
              <button type="button" className="nw-btn nw-btn-secondary" onClick={() => setRenaming(true)}>
                <IconPencil />
                Rename
              </button>
            ) : null}
            <button type="button" className="nw-btn nw-btn-primary" onClick={() => onCreatePrd(project?.id ?? null)}>
              <IconPlus size={16} strokeWidth={2} />
              {project ? "New PRD here" : "New PRD"}
            </button>
          </div>
        </div>
      </div>

      <div className="nw-proj-body">
        <nav aria-label="Projects" className="nw-proj-nav">
          <h2 className="nw-side-label nw-proj-nav-label">Projects</h2>
          {sorted.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nw-nav-item${item.id === currentId ? " is-current" : ""}`}
              aria-current={item.id === currentId ? "page" : undefined}
              onClick={() => onSelect(item.id)}
            >
              <IconFolder size={17} />
              <span className="nw-nav-text">{item.name}</span>
              <span className="nw-nav-count">{counts[item.id] ?? 0}</span>
            </button>
          ))}
          {noProjectCount || currentId === NO_PROJECT ? (
            <button
              type="button"
              className={`nw-nav-item${currentId === NO_PROJECT ? " is-current" : ""}`}
              aria-current={currentId === NO_PROJECT ? "page" : undefined}
              onClick={() => onSelect(NO_PROJECT)}
            >
              <IconFolder size={17} />
              <span className="nw-nav-text">No project</span>
              <span className="nw-nav-count">{noProjectCount}</span>
            </button>
          ) : null}
          <button type="button" className="nw-proj-new" onClick={() => setCreating(true)}>
            <IconPlus size={16} strokeWidth={2} />
            New project
          </button>
        </nav>

        <div className="nw-proj-main">
          {inView.length ? (
            <section className="nw-pcards" aria-label={`PRDs in ${title}`}>
              {inView.map((prd) => (
                <PrdCard
                  key={prd.id}
                  prd={prd}
                  account={account}
                  userId={userId}
                  questions={questions}
                  onOpenPrd={onOpenPrd}
                />
              ))}
            </section>
          ) : (
            <section className="nw-blank nw-blank-inline">
              <h2 className="nw-blank-title">No PRDs here yet</h2>
              <p className="nw-blank-text">
                {project ? "Start one in this project." : "PRDs you create without a project show up here."}
              </p>
              <button type="button" className="nw-btn nw-btn-secondary" onClick={() => onCreatePrd(project?.id ?? null)}>
                <IconPlus size={16} strokeWidth={2} />
                {project ? "New PRD here" : "New PRD"}
              </button>
            </section>
          )}
          {project ? (
            <div className="nw-proj-note">
              <span className="nw-proj-note-text">
                <strong>Projects are folders.</strong> Deleting a project also deletes the PRDs in it.
              </span>
              <button type="button" className="nw-btn nw-btn-danger-outline nw-btn-sm" onClick={askDelete}>
                <IconTrash />
                Delete project
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {dialogs}
    </div>
  );
}

export default ProjectsPage;
