import { useEffect, useId, useState } from "react";
import { api } from "../../../../lib/api";
import { initialsOf } from "../format";
import { Alert, Avatar, Modal } from "../ui";

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];
// Teams join as editors or viewers, never as owners.
const TEAM_ROLES = ROLES.filter((role) => role.value !== "owner");
const ROLE_RANK = { viewer: 0, editor: 1, owner: 2 };

// The reasons worth wording ourselves; anything else shows the backend's own
// sentence, which is written to be shown as-is.
function describeError(error) {
  if (error?.code === "owner_required") return "A PRD needs at least one owner.";
  if (error?.code === "not_in_organization") return "That person isn’t an active member of your organization.";
  if (error?.code === "team_not_found") return "That team isn’t active in your organization any more.";
  if (error?.code === "forbidden") return "Only owners and admins can manage people.";
  return error?.message || "That didn’t work. Try again.";
}

const peopleCount = (count) => `${count} ${count === 1 ? "person" : "people"}`;

// "Engineering · Platform (3 people, 1 new)": how many adding it would bring in.
function teamOptionLabel({ label, size, newPeople }) {
  if (newPeople === 0) return `${label} (${peopleCount(size)}) · all already on it`;
  if (newPeople === size) return `${label} (${peopleCount(size)})`;
  return `${label} (${peopleCount(size)}, ${newPeople} new)`;
}

// Active teams that have anyone in them, labelled "Department · Team", with how
// many of their people aren't on the PRD yet.
function teamChoices(directory, onPrd) {
  const departments = new Map((directory.departments ?? []).map((department) => [department.id, department.name]));
  return (directory.teams ?? [])
    .filter((team) => !team.archived)
    .map((team) => {
      const people = directory.members.filter((person) => (person.team_ids ?? []).includes(team.id));
      return {
        id: team.id,
        label: [departments.get(team.department_id), team.name].filter(Boolean).join(" · "),
        size: people.length,
        newPeople: people.filter((person) => !onPrd.has(person.user_id)).length,
      };
    })
    .filter((team) => team.size > 0);
}

// "Added 3 from Engineering · Platform, 1 already on it."
function teamResultSentence({ label, added, skipped }) {
  if (!added.length) return `Everyone on ${label} already has access.`;
  const already = skipped.length ? `, ${skipped.length} already on it` : "";
  return `Added ${added.length} from ${label}${already}.`;
}

// Who is on the PRD and what they can do, plus adding people from the org
// directory. Mounted only while the dialog is open, so each opening reads the
// current list.
function SharePeople({ prd, organizationId, userId, busy, setBusy, onChanged, onClose }) {
  const [members, setMembers] = useState(null);
  const [directory, setDirectory] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [addId, setAddId] = useState("");
  const [addRole, setAddRole] = useState("editor");
  // "person" or "team": which of the two add forms is showing.
  const [addMode, setAddMode] = useState("person");
  const [teamId, setTeamId] = useState("");
  const [teamRole, setTeamRole] = useState("editor");
  // What the last team add did: { label, added, skipped }.
  const [teamResult, setTeamResult] = useState(null);
  // A change to your own access, waiting on "Yes, change it": { role } or { remove: true }.
  const [confirming, setConfirming] = useState(null);
  const ids = useId();

  useEffect(() => {
    let current = true;
    Promise.all([api.listPrdMembers(prd.id), api.getDirectory(organizationId)])
      .then(([people, org]) => {
        if (!current) return;
        setMembers(people);
        setDirectory(org);
      })
      .catch((cause) => {
        if (current) setLoadError(cause?.message || "Try again.");
      });
    return () => {
      current = false;
    };
  }, [prd.id, organizationId, attempt]);

  // `request` resolves to the updated list. Capabilities can change with any
  // of these, so the PRD's details are read again afterwards.
  async function change(request) {
    setBusy(true);
    setError("");
    setConfirming(null);
    setTeamResult(null);
    try {
      setMembers(await request());
      await onChanged();
      return true;
    } catch (cause) {
      setError(describeError(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const setRole = (memberId, role) => change(() => api.setPrdMember(prd.id, memberId, role));
  const remove = (memberId) =>
    change(async () => {
      await api.removePrdMember(prd.id, memberId);
      return members.filter((member) => member.user_id !== memberId);
    });

  async function add() {
    if (await setRole(addId, addRole)) setAddId("");
  }

  async function addTeam(label) {
    let result = null;
    const done = await change(async () => {
      result = await api.addTeamToPrd(prd.id, teamId, teamRole);
      return result.members;
    });
    if (done) {
      setTeamId("");
      setTeamResult({ label, added: result.added, skipped: result.skipped });
    }
  }

  if (loadError) {
    return (
      <>
        <Alert
          onRetry={() => {
            setLoadError("");
            setAttempt((value) => value + 1);
          }}
        >
          <strong>Couldn’t load the people on this PRD.</strong> {loadError}
        </Alert>
        <div className="nw-modal-actions">
          <button type="button" className="nw-btn nw-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </>
    );
  }
  if (!members || !directory) {
    return (
      <p className="nw-modal-text" role="status">
        Loading people…
      </p>
    );
  }

  const known = new Map(directory.members.map((person) => [person.user_id, person]));
  const onPrd = new Set(members.map((member) => member.user_id));
  const available = directory.members.filter((person) => !onPrd.has(person.user_id));
  const teams = teamChoices(directory, onPrd);
  // Without any teams there's nothing to switch to.
  const mode = teams.length ? addMode : "person";
  const pickedTeam = teams.find((team) => team.id === teamId);

  return (
    <>
      <p className="nw-modal-text">People in {directory.organization.name} you add here can open this PRD.</p>
      {error ? <Alert onDismiss={() => setError("")}>{error}</Alert> : null}

      <section className="ne-share-section" aria-labelledby={`${ids}-people`}>
        <h3 id={`${ids}-people`} className="ne-share-label">
          People with access · {members.length}
        </h3>
        <ul className="ne-share-list">
          {members.map((member) => {
            const email = known.get(member.user_id)?.email ?? null;
            const name = member.name ?? email ?? "Unnamed member";
            const you = member.user_id === userId;
            const asked = you && confirming;
            return (
              <li key={member.user_id} className="ne-share-person">
                <Avatar initials={initialsOf(member.name, email)} />
                <div className="ne-share-who">
                  <span className="ne-share-name">
                    {name}
                    {you ? " (you)" : ""}
                  </span>
                  {email ? <span className="ne-share-email">{email}</span> : null}
                </div>
                <select
                  className="nw-select"
                  aria-label={`Role for ${name}`}
                  value={member.role}
                  disabled={busy}
                  onChange={(event) => {
                    const role = event.target.value;
                    if (you && ROLE_RANK[role] < ROLE_RANK[member.role]) setConfirming({ role });
                    else setRole(member.user_id, role);
                  }}
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ne-share-remove"
                  aria-label={`Remove ${name}`}
                  disabled={busy}
                  onClick={() => (you ? setConfirming({ remove: true }) : remove(member.user_id))}
                >
                  Remove
                </button>
                {asked ? (
                  <div className="ne-share-confirm" role="alert">
                    <span>
                      This changes your own access, and you may not be able to undo it. Save any edits first.
                    </span>
                    <span className="ne-share-confirm-actions">
                      <button
                        type="button"
                        className="nw-btn nw-btn-secondary nw-btn-sm"
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="nw-btn nw-btn-danger-outline nw-btn-sm"
                        onClick={() =>
                          confirming.remove ? remove(member.user_id) : setRole(member.user_id, confirming.role)
                        }
                      >
                        Yes, change it
                      </button>
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ne-share-section" aria-labelledby={`${ids}-add`}>
        <h3 id={`${ids}-add`} className="ne-share-label">
          Add people
        </h3>
        {teams.length ? (
          <div className="ne-share-mode" role="group" aria-label="Add">
            {[
              ["person", "A person"],
              ["team", "A whole team"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`ne-share-mode-btn${mode === value ? " is-active" : ""}`}
                aria-pressed={mode === value}
                disabled={busy}
                onClick={() => setAddMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {mode === "team" ? (
          <>
            <div className="ne-share-add">
              <select
                className="nw-select ne-share-pick"
                aria-label="Team to add"
                value={teamId}
                disabled={busy}
                onChange={(event) => setTeamId(event.target.value)}
              >
                <option value="">Choose a team…</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id} disabled={team.newPeople === 0}>
                    {teamOptionLabel(team)}
                  </option>
                ))}
              </select>
              <select
                className="nw-select"
                aria-label="Role for the team"
                value={teamRole}
                disabled={busy}
                onChange={(event) => setTeamRole(event.target.value)}
              >
                {TEAM_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="nw-btn nw-btn-primary nw-btn-sm"
                disabled={busy || !pickedTeam}
                onClick={() => addTeam(pickedTeam.label)}
              >
                Add team
              </button>
            </div>
            {teamResult ? (
              <p className="ne-share-result" role="status">
                <strong>{teamResultSentence(teamResult)}</strong>
                {teamResult.added.length && teamResult.skipped.length ? (
                  <>
                    {" "}
                    Already on it, role unchanged:{" "}
                    {teamResult.skipped.map((member) => member.name ?? "Unnamed member").join(", ")}.
                  </>
                ) : null}
              </p>
            ) : null}
            <p className="ne-share-note">
              Adds the people on the team now, one by one. Anyone who joins the team later isn’t added, and nobody
              already on the PRD changes role.
            </p>
          </>
        ) : available.length ? (
          <div className="ne-share-add">
            <select
              className="nw-select ne-share-pick"
              aria-label="Person to add"
              value={addId}
              disabled={busy}
              onChange={(event) => setAddId(event.target.value)}
            >
              <option value="">Choose a person…</option>
              {available.map((person) => (
                <option key={person.user_id} value={person.user_id}>
                  {person.name ?? person.email ?? "Unnamed member"}
                  {person.name && person.email ? ` · ${person.email}` : ""}
                </option>
              ))}
            </select>
            <select
              className="nw-select"
              aria-label="Role for the person to add"
              value={addRole}
              disabled={busy}
              onChange={(event) => setAddRole(event.target.value)}
            >
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            <button type="button" className="nw-btn nw-btn-primary nw-btn-sm" disabled={busy || !addId} onClick={add}>
              Add
            </button>
          </div>
        ) : (
          <p className="nw-modal-text">Everyone in your organization already has access.</p>
        )}
        <p className="ne-share-note">Owners manage people and choose reviewers. Editors can edit. Viewers can read and comment.</p>
      </section>

      <div className="nw-modal-actions">
        <button type="button" className="nw-btn nw-btn-secondary" disabled={busy} onClick={onClose}>
          Done
        </button>
      </div>
    </>
  );
}

// "Share": owners and org admins manage who's on a PRD and their roles
// (Decisions 1, 3 and 4).
export function ShareDialog({ open, prd, organizationId, userId, onChanged, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title={`Share “${prd.title}”`} busy={busy} onClose={onClose} className="ne-share-modal">
      <SharePeople
        prd={prd}
        organizationId={organizationId}
        userId={userId}
        busy={busy}
        setBusy={setBusy}
        onChanged={onChanged}
        onClose={onClose}
      />
    </Modal>
  );
}
