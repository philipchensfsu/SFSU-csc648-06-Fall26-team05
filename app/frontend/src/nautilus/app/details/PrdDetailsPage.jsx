import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "../../../../lib/api";
import "../workspace.css";
import "../flow/flow.css";
import "../editor/editor.css";
import "../editor/comparison.css";
import "./details.css";
import { FlowBar } from "../flow/FlowBar";
import { ApprovalsCard } from "../editor/ReviewPanel";
import { ShareDialog } from "../editor/ShareDialog";
import { editedWhen, formatDate, formatDayTime, initialsOf } from "../format";
import { IconPencil, IconPeople } from "../icons";
import { Avatar, StatusChip } from "../ui";
import HistoryList from "./HistoryList";
import { VersionComparison, VersionReader } from "./VersionView";
import {
  canMoveWorkStatus,
  originLabel,
  PRIORITIES,
  priorityLabel,
  roleLabel,
  sectionLabel,
  sortMembers,
  teamName,
  teamOptions,
  versionAuthor,
  WORK_STATUSES,
  workStatusLabel,
} from "./details";

const EMPTY_VERSIONS = { items: [], nextCursor: null, loading: false, error: null };

// What a routing or work status change can move. The rest of the detail
// (approval, permissions, versions) stays as it was read.
const CHANGING_FIELDS = ["owning_team_id", "priority", "status", "review_state", "work_status", "revision", "updated_at"];

function withChanges(detail, row) {
  const changes = Object.fromEntries(CHANGING_FIELDS.filter((key) => key in (row ?? {})).map((key) => [key, row[key]]));
  return { ...detail, ...changes };
}

// The PRD details page (feature 03) with its revision history (feature 01).
// It reads everything itself, so it shows the latest even when the list
// row it was opened from is old.
//
// Props:
//   prd             the list row it was opened from: id and title for the
//                   first paint
//   view            { tab: "overview" | "history", versionId?, compare? }
//   organizationId, userId
//   onNavigate(view)   moves between the tabs, a version and a comparison
//   onOpenEditor()  the PRD in the editor
//   onHome()        back to the dashboard
export default function PrdDetailsPage({ prd, view, organizationId, userId, onNavigate, onOpenEditor, onHome }) {
  const prdId = prd.id;
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [members, setMembers] = useState(null);
  const [teams, setTeams] = useState(null);
  const [versions, setVersions] = useState({ ...EMPTY_VERSIONS, loading: true });
  const [sharing, setSharing] = useState(false);
  const latest = useRef(0);

  // The fetch* functions only set state when their answer arrives; the
  // handlers below them show "loading" first.
  const fetchDetail = useCallback(() => {
    const request = ++latest.current;
    return api
      .getPrd(prdId)
      .then((row) => {
        if (request !== latest.current) return;
        setDetail(row);
        setLoadError("");
      })
      .catch((error) => {
        if (request === latest.current) setLoadError(error.message);
      });
  }, [prdId]);

  const fetchMembers = useCallback(() => {
    api
      .listPrdMembers(prdId)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [prdId]);

  // A page of history: the first one replaces the list, later ones add to it.
  const fetchVersions = useCallback(
    (cursor = null) => {
      api
        .listVersions(prdId, { cursor })
        .then((page) =>
          setVersions((current) => ({
            items: cursor ? [...current.items, ...page.items] : page.items,
            nextCursor: page.next_cursor,
            loading: false,
            error: null,
          })),
        )
        .catch((error) => setVersions((current) => ({ ...current, loading: false, error: error.message })));
    },
    [prdId],
  );

  useEffect(() => {
    fetchDetail();
    fetchMembers();
    fetchVersions();
  }, [fetchDetail, fetchMembers, fetchVersions]);

  function retryDetail() {
    setLoadError("");
    fetchDetail();
  }

  function retryVersions() {
    setVersions({ ...EMPTY_VERSIONS, loading: true });
    fetchVersions();
  }

  function showOlderVersions() {
    setVersions((current) => ({ ...current, loading: true, error: null }));
    fetchVersions(versions.nextCursor);
  }

  // Team names for the owning team; members can read the directory.
  useEffect(() => {
    if (!organizationId) return;
    api
      .getDirectory(organizationId)
      .then((directory) => setTeams(directory.teams ?? []))
      .catch(() => setTeams([]));
  }, [organizationId]);

  const title = detail?.title ?? prd.title ?? "Untitled PRD";
  useEffect(() => {
    document.title = `Nautilus — ${title}`;
    return () => {
      document.title = "Nautilus";
    };
  }, [title]);

  const tab = view?.tab === "history" ? "history" : "overview";
  const versionId = tab === "history" ? (view?.versionId ?? null) : null;
  const compare = Boolean(versionId && view?.compare);
  const currentVersion = detail?.current_version ?? null;

  let place = tab === "history" ? "History" : "Details";
  if (versionId) {
    const known = versions.items.find((item) => item.id === versionId);
    const number = known ? ` ${known.version_no}` : "";
    place = compare ? `Compare version${number}` : `Version${number}`;
  }

  const canShare = detail?.capabilities?.can_assign === true;

  return (
    <div className="nw-root nw-flow nd-page">
      <FlowBar
        onHome={onHome}
        crumbs={[
          { label: "Dashboard", onClick: onHome },
          versionId || tab === "history"
            ? { label: title, onClick: () => onNavigate({ tab: "overview" }) }
            : { label: title },
          ...(versionId ? [{ label: "History", onClick: () => onNavigate({ tab: "history" }) }] : []),
          { label: place, current: true },
        ]}
        after={detail ? <StatusChip status={detail.status} reviewState={detail.review_state ?? null} /> : null}
        actions={
          <>
            {canShare ? (
              <button type="button" className="nw-btn nw-btn-secondary ne-btn-38" onClick={() => setSharing(true)}>
                <IconPeople size={16} />
                Share
              </button>
            ) : null}
            <button type="button" className="nw-btn nw-btn-primary ne-btn-38" onClick={onOpenEditor}>
              <IconPencil size={15} />
              Open editor
            </button>
          </>
        }
      />

      <main className="nd-main" id="nw-main" tabIndex={-1}>
        {loadError && !detail ? (
          <div className="nd-error" role="alert">
            Couldn’t load this PRD. {loadError}{" "}
            <button type="button" className="nw-btn nw-btn-secondary nd-btn-sm" onClick={retryDetail}>
              Try again
            </button>
          </div>
        ) : null}

        {versionId ? null : (
          <>
            <header className="nd-head">
              <span className="nd-label">Product requirements document</span>
              <h1 className="nd-title">{title}</h1>
              {detail?.description ? <p className="nd-desc">{detail.description}</p> : null}
              {detail ? (
                <p className="nd-meta">
                  {detail.project ? (
                    <span>
                      Project: <strong>{detail.project.name}</strong>
                    </span>
                  ) : null}
                  {detail.owners?.length ? (
                    <span>
                      {detail.owners.length === 1 ? "Owner" : "Owners"}:{" "}
                      <strong>{detail.owners.map((owner) => owner.name ?? "Unnamed member").join(", ")}</strong>
                    </span>
                  ) : null}
                  <span>
                    {currentVersion?.version_no ? `Version ${currentVersion.version_no} · ` : ""}edited{" "}
                    {editedWhen(detail.updated_at)}
                  </span>
                </p>
              ) : null}
            </header>

            <nav aria-label="PRD details" className="nd-tabs">
              <button
                type="button"
                className={`nd-tab${tab === "overview" ? " is-active" : ""}`}
                aria-current={tab === "overview" ? "page" : undefined}
                onClick={() => onNavigate({ tab: "overview" })}
              >
                Overview
              </button>
              <button
                type="button"
                className={`nd-tab${tab === "history" ? " is-active" : ""}`}
                aria-current={tab === "history" ? "page" : undefined}
                onClick={() => onNavigate({ tab: "history" })}
              >
                History
                {currentVersion?.version_no ? <span className="nd-tab-count"> ({currentVersion.version_no})</span> : null}
              </button>
            </nav>
          </>
        )}

        {tab === "overview" && detail ? (
          <Overview
            detail={detail}
            setDetail={setDetail}
            members={members}
            teams={teams}
            versions={versions}
            userId={userId}
            canShare={canShare}
            onShare={() => setSharing(true)}
            onOpenHistory={() => onNavigate({ tab: "history" })}
            onOpenVersion={(id) => onNavigate({ tab: "history", versionId: id })}
            onOpenEditor={onOpenEditor}
          />
        ) : null}

        {tab === "history" && !versionId ? (
          <HistoryList
            versions={versions}
            currentVersionId={currentVersion?.id ?? null}
            onView={(id) => onNavigate({ tab: "history", versionId: id })}
            onCompare={(id) => onNavigate({ tab: "history", versionId: id, compare: true })}
            onLoadMore={showOlderVersions}
            onRetry={retryVersions}
          />
        ) : null}

        {versionId ? (
          <VersionScreen
            key={`${versionId}:${compare}`}
            prdId={prdId}
            versionId={versionId}
            compare={compare}
            detail={detail}
            onNavigate={onNavigate}
          />
        ) : null}
      </main>

      {detail && canShare ? (
        <ShareDialog
          open={sharing}
          prd={{ id: prdId, title }}
          organizationId={organizationId}
          userId={userId}
          onChanged={() => {
            fetchMembers();
            fetchDetail();
          }}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </div>
  );
}

// A version read alone, or beside the current PRD.
function VersionScreen({ prdId, versionId, compare, detail, onNavigate }) {
  const [version, setVersion] = useState(null);
  const [error, setError] = useState("");

  const fetchVersion = useCallback(() => {
    api
      .getVersion(prdId, versionId)
      .then(setVersion)
      .catch((reason) => setError(reason.message));
  }, [prdId, versionId]);

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  function load() {
    setError("");
    fetchVersion();
  }

  const currentNo = detail?.current_version?.version_no ?? null;
  const isCurrent = version && detail?.current_version?.id === version.id;

  return (
    <div className="nd-version-screen">
      <div className="nd-version-bar">
        <button type="button" className="nw-btn nw-btn-secondary nd-btn-sm" onClick={() => onNavigate({ tab: "history" })}>
          Back to history
        </button>
        {version && !isCurrent ? (
          compare ? (
            <button
              type="button"
              className="nw-btn nw-btn-secondary nd-btn-sm"
              onClick={() => onNavigate({ tab: "history", versionId })}
            >
              Read version {version.version_no}
            </button>
          ) : (
            <button
              type="button"
              className="nw-btn nw-btn-primary nd-btn-sm"
              onClick={() => onNavigate({ tab: "history", versionId, compare: true })}
            >
              Compare with current
            </button>
          )
        ) : null}
      </div>

      {error ? (
        <div className="nd-error" role="alert">
          Couldn’t load this version. {error}{" "}
          <button type="button" className="nw-btn nw-btn-secondary nd-btn-sm" onClick={load}>
            Try again
          </button>
        </div>
      ) : null}
      {!version && !error ? (
        <p className="nd-muted" role="status">
          Loading version…
        </p>
      ) : null}
      {version && compare && detail ? (
        <VersionComparison version={version} currentDocument={detail.content_json} currentVersionNo={currentNo} />
      ) : null}
      {version && !compare ? <VersionReader version={version} currentVersionNo={currentNo} /> : null}
    </div>
  );
}

function Overview({
  detail,
  setDetail,
  members,
  teams,
  versions,
  userId,
  canShare,
  onShare,
  onOpenHistory,
  onOpenVersion,
  onOpenEditor,
}) {
  const ids = useId();
  const people = members ? sortMembers(members) : null;
  const latestVersions = versions.items.slice(0, 3);

  return (
    <div className="nd-grid">
      <div className="nd-col nd-col-main">
        <RoutingCard detail={detail} setDetail={setDetail} teams={teams} />

        <section className="ne-card" aria-labelledby={`${ids}-people`}>
          <div className="ne-card-head">
            <h2 id={`${ids}-people`} className="ne-card-title">
              People on this PRD{people ? <span className="nd-muted"> ({people.length})</span> : null}
            </h2>
            {canShare ? (
              <button type="button" className="nw-btn nw-btn-secondary nd-btn-sm" onClick={onShare}>
                Manage access
              </button>
            ) : null}
          </div>
          {people === null ? (
            <p className="nd-muted">Loading…</p>
          ) : people.length ? (
            <ul className="nd-people">
              {people.map((person) => (
                <li key={person.user_id}>
                  <Avatar initials={initialsOf(person.name, null)} />
                  <span className="nd-person">
                    {person.name ?? "Unnamed member"}
                    {person.user_id === userId ? <span className="nd-muted"> · you</span> : null}
                  </span>
                  <span className={`nw-chip nd-role nd-role-${person.role}`}>{roleLabel(person.role)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nd-muted">Couldn’t load the people on this PRD.</p>
          )}
        </section>
      </div>

      <div className="nd-col nd-col-side">
        {detail.approval?.required_count ? (
          <div className="nd-approval">
            <ApprovalsCard approval={detail.approval} userId={userId} />
            <p className="nd-card-foot">
              Round {detail.approval.round_no}
              {detail.approval.state === "approved" ? " · approved" : ""}.{" "}
              <button type="button" className="ne-link-btn" onClick={onOpenEditor}>
                Open the review in the editor
              </button>
            </p>
          </div>
        ) : (
          <section className="ne-card" aria-labelledby={`${ids}-approval`}>
            <div className="ne-card-head">
              <h2 id={`${ids}-approval`} className="ne-card-title">
                Approvals
              </h2>
            </div>
            <p className="nd-muted">Not submitted for review yet.</p>
          </section>
        )}

        <WorkStatusCard detail={detail} setDetail={setDetail} />

        <section className="ne-card" aria-labelledby={`${ids}-versions`}>
          <div className="ne-card-head">
            <h2 id={`${ids}-versions`} className="ne-card-title">
              Latest versions
            </h2>
            {versions.items.length ? (
              <button type="button" className="ne-link-btn" onClick={onOpenHistory}>
                View all
              </button>
            ) : null}
          </div>
          {latestVersions.length ? (
            <ol className="nd-mini-versions">
              {latestVersions.map((version) => (
                <li key={version.id}>
                  <button type="button" className="nd-mini-version" onClick={() => onOpenVersion(version.id)}>
                    <span className="nd-vno">v{version.version_no}</span>
                    <span className="nd-mini-text">
                      {version.origin === "checkpoint" ? originLabel(version.origin) : versionAuthor(version)}
                      {version.changed_sections?.length
                        ? ` · ${version.changed_sections.slice(0, 2).map(sectionLabel).join(", ")}${
                            version.changed_sections.length > 2 ? ` +${version.changed_sections.length - 2}` : ""
                          }`
                        : ""}
                    </span>
                    <span className="nd-muted">{formatDayTime(version.created_at)}</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="nd-muted">{versions.loading ? "Loading…" : "No saved versions yet."}</p>
          )}
        </section>
      </div>
    </div>
  );
}

// Status, owning team and priority, and when the PRD was made. Owners and
// org admins change the team and priority; everyone else reads them.
function RoutingCard({ detail, setDetail, teams }) {
  const ids = useId();
  const canSet = detail.capabilities?.can_set_routing === true;
  const canSuggest = detail.capabilities?.can_request_classification === true;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [asking, setAsking] = useState(false);
  const options = teamOptions(teams, detail.owning_team_id);

  function save(next) {
    setSaving(true);
    setError("");
    api
      .setRouting(detail.id, next)
      .then((row) => setDetail((current) => withChanges(current, row)))
      .catch((reason) => setError(reason.message))
      .finally(() => setSaving(false));
  }

  function suggest() {
    setAsking(true);
    setError("");
    api
      .suggestRouting(detail.id, detail.revision)
      .then((result) => setSuggestion(result.suggestion))
      .catch((reason) => setError(reason.message))
      .finally(() => setAsking(false));
  }

  function decide(decision) {
    const pending = suggestion;
    setSaving(true);
    setError("");
    api
      .decideRouting(detail.id, pending.id, { decision })
      .then((row) => {
        setDetail((current) => withChanges(current, row));
        setSuggestion(null);
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setSaving(false));
  }

  return (
    <section className="ne-card" aria-labelledby={`${ids}-title`}>
      <div className="ne-card-head">
        <h2 id={`${ids}-title`} className="ne-card-title">
          Overview
        </h2>
      </div>
      <dl className="nd-dl">
        <dt>Status</dt>
        <dd>
          <StatusChip status={detail.status} reviewState={detail.review_state ?? null} />
        </dd>

        <dt>{canSet ? <label htmlFor={`${ids}-team`}>Owning team</label> : "Owning team"}</dt>
        <dd className="nd-inline">
          {canSet ? (
            <select
              id={`${ids}-team`}
              className="nd-select"
              value={detail.owning_team_id ?? ""}
              disabled={saving || teams === null}
              onChange={(event) => save({ teamId: event.target.value || null, priority: detail.priority ?? null })}
            >
              <option value="">No team</option>
              {options.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.label}
                </option>
              ))}
            </select>
          ) : (
            teamName(teams, detail.owning_team_id)
          )}
          {canSuggest && !suggestion ? (
            <button type="button" className="nw-btn nw-btn-secondary nd-btn-sm" onClick={suggest} disabled={asking || saving}>
              {asking ? "Thinking…" : "Suggest with AI"}
            </button>
          ) : null}
        </dd>

        <dt>{canSet ? <label htmlFor={`${ids}-priority`}>Priority</label> : "Priority"}</dt>
        <dd>
          {canSet ? (
            <select
              id={`${ids}-priority`}
              className="nd-select"
              value={detail.priority ?? ""}
              disabled={saving}
              onChange={(event) =>
                save({ teamId: detail.owning_team_id ?? null, priority: event.target.value || null })
              }
            >
              <option value="">Not set</option>
              {PRIORITIES.map((priority) => (
                <option key={priority.id} value={priority.id}>
                  {priority.label}
                </option>
              ))}
            </select>
          ) : (
            priorityLabel(detail.priority)
          )}
        </dd>

        <dt>Created</dt>
        <dd>{formatDate(detail.created_at)}</dd>
        <dt>Last saved</dt>
        <dd>{formatDayTime(detail.updated_at)}</dd>
      </dl>

      {suggestion ? (
        <div className="nd-suggestion" role="status">
          <p>
            <strong>AI suggests:</strong> {teamName(teams, suggestion.team_id)} · {priorityLabel(suggestion.priority)}{" "}
            priority
          </p>
          {suggestion.rationale ? <p className="nd-muted">{suggestion.rationale}</p> : null}
          <div className="nd-inline">
            <button type="button" className="nw-btn nw-btn-primary nd-btn-sm" onClick={() => decide("accepted")} disabled={saving}>
              Use this
            </button>
            <button type="button" className="nw-btn nw-btn-secondary nd-btn-sm" onClick={() => decide("rejected")} disabled={saving}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : saving ? (
        <p className="nd-muted" role="status">
          Saving…
        </p>
      ) : null}
    </section>
  );
}

// E14: owners and org admins move the work status, only while approved.
function WorkStatusCard({ detail, setDetail }) {
  const ids = useId();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const current = detail.work_status ?? "not_started";
  const canUpdate = detail.capabilities?.can_update_work_status === true;
  const approved = detail.status === "final" || detail.status === "assigned";

  function move(to) {
    setSaving(true);
    setError("");
    api
      .setWorkStatus(detail.id, { from: current, to })
      .then((row) => setDetail((existing) => withChanges(existing, row)))
      .catch((reason) => setError(reason.message))
      .finally(() => setSaving(false));
  }

  // Owners and org admins hear when they can change it; everyone else, who.
  const manages = detail.my_role === "owner" || detail.my_role === "org_admin";
  let note = "";
  if (!manages) note = "Only the PRD’s owners and org admins can change it.";
  else if (!approved) note = "Can change once the PRD is approved.";

  return (
    <section className="ne-card" aria-labelledby={`${ids}-title`}>
      <div className="ne-card-head">
        <h2 id={`${ids}-title`} className="ne-card-title">
          Work status
        </h2>
        <span className="ne-card-note">{workStatusLabel(current)}</span>
      </div>
      <div className="nd-segments" role="group" aria-labelledby={`${ids}-title`}>
        {WORK_STATUSES.map((status) => {
          const active = status.id === current;
          const allowed = canUpdate && canMoveWorkStatus(current, status.id);
          return (
            <button
              key={status.id}
              type="button"
              className={`nd-segment${active ? " is-active" : ""}`}
              aria-pressed={active}
              disabled={!allowed || saving}
              onClick={() => move(status.id)}
            >
              {status.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : note ? (
        <p className="nd-muted">{note}</p>
      ) : null}
    </section>
  );
}
