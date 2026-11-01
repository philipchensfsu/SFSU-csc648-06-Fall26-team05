import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { ConfirmDialog } from "./dialogs";

// "Invite your team": the organization's join code, for admins only (the API
// refuses members). People enter it on the sign-up page's "Join an organization" tab.
// `onOpenPeople`, when given, adds a link to the People page.
function InviteCard({ organization, onOpenPeople }) {
  const orgId = organization.organization_id;
  const [code, setCode] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let current = true;
    api
      .getJoinCode(orgId)
      .then((result) => current && setCode(result.join_code))
      .catch((reason) => current && setError(reason.message));
    return () => {
      current = false;
    };
  }, [orgId]);

  function copy() {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError("Couldn’t copy. Select the code and copy it instead."));
  }

  async function regenerate() {
    const result = await api.regenerateJoinCode(orgId);
    setCode(result.join_code);
    setCopied(false);
  }

  return (
    <section className="nw-invite" aria-labelledby="nw-invite-h">
      <div className="nw-invite-copy">
        <h2 id="nw-invite-h" className="nw-invite-title">
          Invite your team
        </h2>
        <p className="nw-invite-text">
          Share this code. People pick “Join an organization” when they sign up and join {organization.name} as members.
        </p>
      </div>
      <div className="nw-invite-row">
        <span className="nw-invite-code" aria-live="polite">
          {code ?? (error ? "—" : "Loading…")}
        </span>
        <button type="button" className="nw-btn nw-btn-primary" disabled={!code} onClick={copy}>
          {copied ? "Copied" : "Copy code"}
        </button>
        <button type="button" className="nw-btn nw-btn-danger-outline" disabled={!code} onClick={() => setConfirming(true)}>
          Make a new code
        </button>
      </div>
      {error ? (
        <p className="nw-error" role="alert">
          {error}
        </p>
      ) : null}
      {onOpenPeople ? (
        <button type="button" className="nw-link-btn" onClick={onOpenPeople}>
          See who’s joined
        </button>
      ) : null}
      <ConfirmDialog
        open={confirming}
        title="Make a new join code?"
        confirmLabel="Make a new code"
        busyLabel="Making…"
        onConfirm={regenerate}
        onClose={() => setConfirming(false)}
      >
        <p>The current code stops working straight away. People already in {organization.name} stay in.</p>
      </ConfirmDialog>
    </section>
  );
}

export default InviteCard;
