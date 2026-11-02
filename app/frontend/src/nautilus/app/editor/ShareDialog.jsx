import { useEffect, useId, useState } from "react";
import { api } from "../../../../lib/api";
import { initialsOf } from "../format";
import { Alert, Avatar, Modal } from "../ui";

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];
const ROLE_RANK = { viewer: 0, editor: 1, owner: 2 };

// The reasons worth wording ourselves; anything else shows the backend's own
// sentence, which is written to be shown as-is.
function describeError(error) {
  if (error?.code === "owner_required") return "A PRD needs at least one owner.";
  if (error?.code === "not_in_organization") return "That person isn’t an active member of your organization.";
  if (error?.code === "forbidden") return "Only owners and admins can manage people.";
  return error?.message || "That didn’t work. Try again.";
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
        {available.length ? (
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
