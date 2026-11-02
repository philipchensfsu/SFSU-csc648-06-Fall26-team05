import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  blocksOf,
  cleanSearchTerm,
  editedWhen,
  formatDate,
  includesTerm,
  plural,
  prdSummary,
  snippetAround,
  splitMatches,
  splitRequirementId,
} from "./format";
import { IconDoc, IconFolder, IconSearch, IconX } from "./icons";
import { StatusChip } from "./ui";

const SEARCH_DELAY_MS = 250;
const MAX_MATCHES_PER_PRD = 3;

function Highlight({ text, term }) {
  return splitMatches(text, term).map((part, index) =>
    part.match ? <mark key={index}>{part.text}</mark> : part.text,
  );
}

// Turns the PRDs the API matched (title or text, GET /api/prds?search=) and
// the projects whose names match into result rows: one per matching passage
// of a PRD (up to three), or one for the PRD itself when its title matched.
function buildResults(found, projects, term) {
  const rows = [];
  found.forEach((prd) => {
    const passages = [];
    (prd.sections ?? []).forEach((section, index) => {
      const blocks = blocksOf(section.html);
      const hits = blocks.filter((text) => includesTerm(text, term));
      hits.forEach((text) => passages.push({ section, index, text, score: 1 }));
      if (!hits.length && includesTerm(section.title ?? "", term)) {
        passages.push({ section, index, text: blocks[0] ?? "", score: 2 });
      }
    });
    const titleMatch = includesTerm(prd.title, term);
    if (titleMatch || passages.length === 0) {
      rows.push({ kind: "prd", key: `prd-${prd.id}`, prd, score: titleMatch ? 3 : 0 });
    }
    passages.slice(0, MAX_MATCHES_PER_PRD).forEach((passage, order) => {
      rows.push({ kind: "section", key: `sec-${prd.id}-${passage.index}-${order}`, prd, ...passage });
    });
  });
  projects.forEach((project) => {
    if (includesTerm(project.name, term)) {
      rows.push({ kind: "project", key: `project-${project.id}`, project, score: 3 });
    }
  });
  return rows;
}

const updatedOf = (row) => (row.kind === "project" ? row.project.updated_at : row.prd.updatedAt) ?? "";

function ResultRow({ row, term, projectById, prdCounts }) {
  if (row.kind === "project") {
    const { project } = row;
    return (
      <>
        <span className="nw-result-icon nw-result-icon-project">
          <IconFolder />
        </span>
        <span className="nw-result-body">
          <span className="nw-result-path">Project</span>
          <span className="nw-result-title">
            <Highlight text={project.name} term={term} />
          </span>
          <span className="nw-result-meta">
            Created {formatDate(project.created_at)} · {plural(prdCounts[project.id] ?? 0, "PRD")}
          </span>
        </span>
      </>
    );
  }

  const { prd } = row;
  const project = prd.projectId ? projectById.get(prd.projectId) : null;
  let path;
  let title;
  let text;
  if (row.kind === "section") {
    path = (
      <>
        {prd.title}
        <span aria-hidden="true">›</span>
        <span className="nw-mono">§{row.index + 1}</span>
      </>
    );
    title = row.section.title;
    const snippet = snippetAround(row.text, term);
    const { id, rest } = splitRequirementId(snippet);
    text = (
      <>
        {id ? <span className="nw-req-id">{id}</span> : null}
        {id ? " " : null}
        <Highlight text={rest} term={term} />
      </>
    );
  } else {
    path = project ? (
      <>
        PRD<span aria-hidden="true">›</span>
        {project.name}
      </>
    ) : (
      "PRD"
    );
    title = <Highlight text={prd.title} term={term} />;
    const body = includesTerm(prd.title, term) ? prdSummary(prd) : snippetAround(prd.contentText ?? "", term);
    text = body ? <Highlight text={body} term={term} /> : null;
  }

  return (
    <>
      <span className="nw-result-icon">
        <IconDoc />
      </span>
      <span className="nw-result-body">
        <span className="nw-result-path">{path}</span>
        <span className="nw-result-title">{title}</span>
        {text ? <span className="nw-result-text">{text}</span> : null}
        <span className="nw-result-meta">
          <StatusChip status={prd.status} reviewState={prd.reviewState} />
          Edited {editedWhen(prd.updatedAt)}
        </span>
      </span>
    </>
  );
}

function SearchPage({ query, prds, projects, onQueryChange, onSearchPrds, onOpenPrd, onOpenProject }) {
  const [results, setResults] = useState({ term: "", prds: [] });
  const [failure, setFailure] = useState(null);
  const [type, setType] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sort, setSort] = useState("best");
  const [active, setActive] = useState({ key: "", index: 0 });
  const inputRef = useRef(null);
  const latest = useRef(0);
  const term = cleanSearchTerm(query);

  // Arriving here (from the sidebar, ⌘K or typing on the dashboard) puts the
  // cursor at the end of the query, so typing just carries on.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  useEffect(() => {
    if (!term) return undefined;
    const handle = setTimeout(() => {
      const requestId = ++latest.current;
      onSearchPrds(term)
        .then((found) => {
          if (requestId === latest.current) setResults({ term, prds: found });
        })
        .catch((error) => {
          if (requestId === latest.current) setFailure({ term, message: error.message });
        });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(handle);
  }, [term, onSearchPrds]);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects],
  );
  const prdCounts = useMemo(() => {
    const counts = {};
    prds.forEach((prd) => {
      if (prd.projectId) counts[prd.projectId] = (counts[prd.projectId] ?? 0) + 1;
    });
    return counts;
  }, [prds]);

  // While a new search is out, the previous results stay up (dimmed).
  const hasTerm = Boolean(term);
  const rows = useMemo(
    () => (hasTerm && results.term ? buildResults(results.prds, projects, results.term) : []),
    [hasTerm, results, projects],
  );

  const inProject = rows.filter((row) => {
    if (projectFilter === "all") return true;
    if (row.kind === "project") return row.project.id === projectFilter;
    return (row.prd.projectId ?? "none") === projectFilter;
  });
  const prdRows = inProject.filter((row) => row.kind !== "project").length;
  const projectRows = inProject.length - prdRows;
  const shown = inProject
    .filter((row) => type === "all" || (type === "projects") === (row.kind === "project"))
    .sort((a, b) =>
      sort === "best" && a.score !== b.score ? b.score - a.score : updatedOf(b).localeCompare(updatedOf(a)),
    );

  const listKey = `${results.term}|${type}|${projectFilter}|${sort}`;
  const activeIndex = active.key === listKey ? Math.min(active.index, shown.length - 1) : 0;
  const ready = Boolean(term) && results.term === term;
  const failed = Boolean(term) && failure?.term === term && !ready;
  const searching = Boolean(term) && !ready && !failed;

  function open(row) {
    if (row.kind === "project") onOpenProject(row.project.id);
    else onOpenPrd(row.prd);
  }

  function move(step) {
    if (!shown.length) return;
    const index = Math.max(0, Math.min(shown.length - 1, activeIndex + step));
    setActive({ key: listKey, index });
    document.getElementById(`nw-result-${index}`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter" && shown[activeIndex] && !event.nativeEvent.isComposing) {
      event.preventDefault();
      open(shown[activeIndex]);
    }
  }

  const typeFilters = [
    ["all", "All", prdRows + projectRows],
    ["prds", "PRDs", prdRows],
    ["projects", "Projects", projectRows],
  ];

  return (
    <div className="nw-page nw-page-search">
      <h1 className="nw-h1">Search</h1>

      <form role="search" className="nw-q" onSubmit={(event) => event.preventDefault()}>
        <IconSearch size={20} strokeWidth={2} />
        <label htmlFor="nw-q" className="nw-sr">
          Search projects and PRDs
        </label>
        <input
          ref={inputRef}
          id="nw-q"
          type="search"
          autoComplete="off"
          spellCheck="false"
          placeholder="Search PRDs and projects"
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls="nw-results"
          aria-autocomplete="list"
          aria-activedescendant={shown.length ? `nw-result-${activeIndex}` : undefined}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="nw-q-clear"
            aria-label="Clear search"
            onClick={() => {
              onQueryChange("");
              inputRef.current?.focus();
            }}
          >
            <IconX />
          </button>
        ) : null}
      </form>

      {term ? (
        <div className="nw-search-bar">
          <div className="nw-filters" role="group" aria-label="Result type">
            {typeFilters.map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                className="nw-filter"
                aria-pressed={type === value}
                onClick={() => setType(value)}
              >
                {label} · {ready ? count : "…"}
              </button>
            ))}
          </div>
          <div className="nw-search-selects">
            <label htmlFor="nw-f-project" className="nw-sr">
              Project
            </label>
            <select
              id="nw-f-project"
              className="nw-select"
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
            >
              <option value="all">All projects</option>
              {sortedProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
              <option value="none">No project</option>
            </select>
            <label htmlFor="nw-f-sort" className="nw-sr">
              Sort
            </label>
            <select id="nw-f-sort" className="nw-select" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="best">Best match</option>
              <option value="recent">Recently updated</option>
            </select>
          </div>
        </div>
      ) : null}

      <div aria-live="polite" className="nw-sr">
        {ready ? `${plural(shown.length, "result")}` : ""}
      </div>

      {!term ? (
        <p className="nw-search-empty">Search the titles and text of your PRDs, and your project names.</p>
      ) : null}
      {failed ? <p className="nw-search-empty nw-search-failed">Search didn’t work: {failure.message}</p> : null}
      {ready && shown.length === 0 ? (
        <div className="nw-search-empty">
          <strong>No results for “{term}”.</strong> Check the spelling or try a shorter word.
        </div>
      ) : null}

      {shown.length ? (
        <ul
          id="nw-results"
          role="listbox"
          aria-label="Search results"
          className={`nw-results${searching ? " is-stale" : ""}`}
        >
          {shown.map((row, index) => (
            <li
              key={row.key}
              id={`nw-result-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`nw-result${index === activeIndex ? " is-active" : ""}`}
              onMouseMove={() => {
                if (index !== activeIndex) setActive({ key: listKey, index });
              }}
              onClick={() => open(row)}
            >
              <ResultRow row={row} term={results.term} projectById={projectById} prdCounts={prdCounts} />
            </li>
          ))}
        </ul>
      ) : null}
      {searching && !shown.length ? (
        <p className="nw-search-empty" role="status">
          Searching…
        </p>
      ) : null}

      <p className="nw-search-keys">
        <span>
          <kbd className="nw-key">↑↓</kbd> to move
        </span>
        <span>
          <kbd className="nw-key">↵</kbd> to open
        </span>
        <span>
          Tip: search a requirement ID like <span className="nw-mono">FR-06</span>
        </span>
      </p>
    </div>
  );
}

export default SearchPage;
