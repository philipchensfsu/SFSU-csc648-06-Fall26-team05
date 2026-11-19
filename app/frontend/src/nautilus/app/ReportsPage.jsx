import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import "./reports.css";
import { STATUS_ORDER, formatDayTime, statusLabel } from "./format";
import {
  countOf,
  hasFilters,
  ownerChoices,
  ownerLabel,
  priorityRows,
  projectChoices,
  reportQuery,
  statusRows,
  teamChoices,
  teamLabel,
  workStatusRows,
} from "./reports";
import { Alert } from "./ui";

const NO_FILTERS = { teamId: "", projectId: "", ownerId: "" };

function CountCard({ title, rows }) {
  return (
    <section className="nw-report-card" aria-label={title}>
      <h2 className="nw-report-card-title">{title}</h2>
      <dl className="nw-report-counts">
        {rows.map((row) => (
          <div key={row.id} className={row.count ? undefined : "is-zero"}>
            <dt>{row.label}</dt>
            <dd>{row.count}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Owners or teams with their totals and a count per PRD status.
function BreakdownTable({ title, nameHeader, rows, nameOf, emptyText }) {
  return (
    <section className="nw-section" aria-label={title}>
      <h2 className="nw-h2">{title}</h2>
      {rows.length ? (
        <div className="nw-table-card">
          <table className="nw-table nw-report-table">
            <thead>
              <tr>
                <th scope="col">{nameHeader}</th>
                <th scope="col">Total</th>
                {STATUS_ORDER.map((status) => (
                  <th key={status} scope="col">
                    {statusLabel(status)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key ?? index}>
                  <th scope="row" className="nw-report-name">
                    {nameOf(row)}
                  </th>
                  <td>{row.total ?? 0}</td>
                  {STATUS_ORDER.map((status) => (
                    <td key={status}>{countOf(row.by_status, status)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="nw-report-none">{emptyText}</p>
      )}
    </section>
  );
}

function FilterSelect({ id, label, allLabel, value, choices, onChange }) {
  return (
    <div className="nw-report-filter">
      <label htmlFor={id} className="nw-report-filter-label">
        {label}
      </label>
      <select id={id} className="nw-select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Feature 10: counts and recent activity across the PRDs this person can see
// (every PRD in the org for an admin), narrowed by team, project or owner.
function ReportsPage({ organization, projects, onOpenPrdById }) {
  const [filters, setFilters] = useState(NO_FILTERS);
  const [attempt, setAttempt] = useState(0);
  // The last answer, tagged with the request it answers. While the current
  // request is out, the last report stays on screen, dimmed.
  const [answer, setAnswer] = useState({ key: null, report: null, error: "" });
  const [directory, setDirectory] = useState(null);
  const [directoryError, setDirectoryError] = useState(false);
  const [problem, setProblem] = useState("");
  const orgId = organization?.id ?? null;

  // Team and owner choices come from the org directory.
  useEffect(() => {
    if (!orgId) return undefined;
    let current = true;
    api
      .getDirectory(orgId)
      .then((result) => {
        if (current) setDirectory(result);
      })
      .catch(() => {
        if (current) setDirectoryError(true);
      });
    return () => {
      current = false;
    };
  }, [orgId]);

  // Read again whenever a filter changes. An answer for filters that have
  // since changed is dropped, so the page never shows a stale report.
  const requestKey = `${filters.teamId}|${filters.projectId}|${filters.ownerId}|${attempt}`;
  useEffect(() => {
    let current = true;
    api
      .getProgressReport(reportQuery(filters))
      .then((result) => {
        if (current) setAnswer({ key: requestKey, report: result, error: "" });
      })
      .catch((error) => {
        if (current) setAnswer((last) => ({ ...last, key: requestKey, error: error?.message || "Try again." }));
      });
    return () => {
      current = false;
    };
  }, [filters, requestKey]);
  const loading = answer.key !== requestKey;
  const { report, error: loadError } = answer;

  const teams = useMemo(() => teamChoices(directory?.teams), [directory]);
  const owners = useMemo(() => ownerChoices(directory?.members), [directory]);
  const projectList = useMemo(() => projectChoices(projects), [projects]);
  const setFilter = (key) => (value) => setFilters((known) => ({ ...known, [key]: value }));

  async function openPrd(id) {
    setProblem("");
    try {
      await onOpenPrdById(id);
    } catch (error) {
      setProblem(error?.status === 404 ? "You can’t open this PRD any more." : error?.message || "Try again.");
    }
  }

  const filtered = hasFilters(filters);
  const isAdmin = organization?.access_role === "admin";

  return (
    <div className="nw-page">
      <div className="nw-head">
        <div>
          <h1 className="nw-h1">Reports</h1>
          <p className="nw-lede">
            {isAdmin
              ? `Progress across every PRD in ${organization.name}.`
              : "Progress across the PRDs you can see."}
          </p>
        </div>
      </div>

      <div className="nw-report-filters" role="group" aria-label="Report filters">
        {directory ? (
          <FilterSelect
            id="nw-r-team"
            label="Team"
            allLabel="All teams"
            value={filters.teamId}
            choices={teams}
            onChange={setFilter("teamId")}
          />
        ) : null}
        <FilterSelect
          id="nw-r-project"
          label="Project"
          allLabel="All projects"
          value={filters.projectId}
          choices={projectList}
          onChange={setFilter("projectId")}
        />
        {directory ? (
          <FilterSelect
            id="nw-r-owner"
            label="Owner"
            allLabel="All owners"
            value={filters.ownerId}
            choices={owners}
            onChange={setFilter("ownerId")}
          />
        ) : null}
        {filtered ? (
          <button type="button" className="nw-btn nw-btn-secondary" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        ) : null}
      </div>
      {directoryError ? (
        <p className="nw-report-note">Team and owner filters aren’t available right now.</p>
      ) : null}

      {problem ? <Alert onDismiss={() => setProblem("")}>{problem}</Alert> : null}
      {loadError ? (
        <Alert onRetry={() => setAttempt((count) => count + 1)}>
          <strong>Couldn’t load this report.</strong> {loadError}
        </Alert>
      ) : null}

      <div className="nw-sr" role="status">
        {loading ? "Loading report…" : ""}
      </div>
      {loading && !report && !loadError ? (
        <p className="nw-loading" aria-hidden="true">
          Loading report…
        </p>
      ) : null}

      {report && !loadError ? (
        <div className={`nw-report${loading ? " is-updating" : ""}`} aria-busy={loading}>
          {(report.total ?? 0) === 0 ? (
            <div className="nw-search-empty">
              {filtered ? (
                <>
                  <strong>No PRDs match these filters.</strong> Try another team, project or owner.
                </>
              ) : (
                "No PRDs to report on yet. Numbers appear here once there are PRDs you can see."
              )}
            </div>
          ) : (
            <>
              <div className="nw-report-summary">
                <section className="nw-report-card nw-report-total" aria-label="Total">
                  <h2 className="nw-report-card-title">Total PRDs</h2>
                  <p className="nw-report-big">{report.total ?? 0}</p>
                </section>
                <CountCard title="Status" rows={statusRows(report.by_status)} />
                <CountCard title="Work status" rows={workStatusRows(report.by_work_status)} />
                <CountCard title="Priority" rows={priorityRows(report.by_priority)} />
              </div>

              <BreakdownTable
                title="By owner"
                nameHeader="Owner"
                rows={(report.by_owner ?? []).map((row) => ({ ...row, key: row.owner?.id }))}
                nameOf={(row) => ownerLabel(row.owner)}
                emptyText="No owners to show."
              />
              <BreakdownTable
                title="By team"
                nameHeader="Team"
                rows={(report.by_team ?? []).map((row) => ({ ...row, key: row.team?.id ?? "none" }))}
                nameOf={(row) => teamLabel(row.team)}
                emptyText="No teams to show."
              />
            </>
          )}

          {(report.total ?? 0) > 0 ? (
            <section className="nw-section" aria-label="Recent activity">
              <h2 className="nw-h2">Recent activity</h2>
              {(report.activity ?? []).length ? (
                <ul className="nw-report-activity">
                  {report.activity.map((event) => (
                    <li key={event.id}>
                      <p className="nw-report-activity-text">{event.summary}</p>
                      <p className="nw-report-activity-meta">
                        <button type="button" className="nw-report-prd" onClick={() => openPrd(event.prd_id)}>
                          {event.prd_title}
                        </button>
                        {" · "}
                        {formatDayTime(event.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="nw-report-none">No activity yet.</p>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default ReportsPage;
