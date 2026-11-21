import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import DiscordConnection from "./DiscordConnection";
import { initialsOf } from "./format";
import { IconCheck, IconSignOut } from "./icons";
import { MIN_PASSWORD_LENGTH, passwordProblems, signsInWithPassword } from "./profile";
import { Alert, Avatar } from "./ui";

function Details({ account, organization }) {
  const role = organization?.access_role === "admin" ? "Admin" : "Member";
  return (
    <section className="np-card" aria-labelledby="np-details-h">
      <div className="np-who">
        <Avatar initials={initialsOf(account.name, account.email)} size="lg" />
        <div>
          <h2 id="np-details-h" className="np-who-name">
            {account.name || account.email}
          </h2>
          {account.name ? <p className="np-who-email">{account.email}</p> : null}
        </div>
      </div>
      <dl className="np-facts">
        <div>
          <dt>Name</dt>
          <dd>{account.name || "Not set"}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{account.email}</dd>
        </div>
        <div>
          <dt>Organization</dt>
          <dd>{organization?.name ?? "None"}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>
            <span className="np-pill np-pill-muted">{role}</span>
          </dd>
        </div>
      </dl>
      {organization && role !== "Admin" ? (
        <p className="nw-hint">To change your role, ask an admin of {organization.name}.</p>
      ) : null}
    </section>
  );
}

function Password({ email }) {
  // null while checking; without Supabase there's nothing to check.
  const [hasPassword, setHasPassword] = useState(() => (supabase ? null : false));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [shown, setShown] = useState(false);
  const [problems, setProblems] = useState({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const id = useId();

  useEffect(() => {
    mounted.current = true;
    let current = true;
    supabase?.auth
      .getSession()
      .then(({ data }) => {
        if (current) setHasPassword(signsInWithPassword(data?.session?.user));
      })
      .catch(() => {
        if (current) setHasPassword(true);
      });
    return () => {
      current = false;
      mounted.current = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaved(false);
    const found = passwordProblems(password, confirm);
    setProblems(found);
    if (found.password) {
      document.getElementById(`${id}-new`)?.focus();
      return;
    }
    if (found.confirm) {
      document.getElementById(`${id}-confirm`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const { error: failed } = await supabase.auth.updateUser({ password });
      if (!mounted.current) return;
      if (failed) {
        setError(failed.message || "Couldn’t change your password. Try again.");
      } else {
        setPassword("");
        setConfirm("");
        setShown(false);
        setSaved(true);
      }
    } catch {
      if (mounted.current) setError("Couldn’t reach the server. Try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  // Typing again clears the last result and that field's problem.
  function edit(setter, field) {
    return (event) => {
      setter(event.target.value);
      setSaved(false);
      if (problems[field]) setProblems({});
    };
  }

  const head = (
    <div className="np-card-head">
      <h2 id="np-password-h" className="nw-h2">
        Password
      </h2>
      {hasPassword ? <p className="nw-hint">Pick a new password for signing in with your email.</p> : null}
    </div>
  );

  if (hasPassword === null) {
    return (
      <section className="np-card" aria-labelledby="np-password-h">
        {head}
        <p className="nw-hint" role="status">
          Checking how you sign in…
        </p>
      </section>
    );
  }

  if (!hasPassword) {
    return (
      <section className="np-card" aria-labelledby="np-password-h">
        {head}
        <p className="np-text">
          {supabase
            ? "You sign in with Google, so there’s no Nautilus password to change. Manage your password in your Google account."
            : "Password changes aren’t available here: sign-in isn’t set up."}
        </p>
      </section>
    );
  }

  const type = shown ? "text" : "password";
  return (
    <section className="np-card" aria-labelledby="np-password-h">
      {head}
      <form className="np-form" onSubmit={submit} noValidate>
        {/* Lets password managers save the new password against this account. */}
        <input type="email" name="username" autoComplete="username" value={email ?? ""} readOnly hidden />
        <div className="np-fields">
          <div className="nw-field">
            <label className="nw-label" htmlFor={`${id}-new`}>
              New password
            </label>
            <div className="np-reveal">
              <input
                id={`${id}-new`}
                className="nw-input"
                type={type}
                autoComplete="new-password"
                value={password}
                onChange={edit(setPassword, "password")}
                aria-invalid={problems.password ? "true" : undefined}
                aria-describedby={problems.password ? `${id}-new-err` : `${id}-rule`}
                disabled={busy}
              />
              <button
                type="button"
                className="np-reveal-btn"
                aria-pressed={shown}
                aria-label={shown ? "Hide passwords" : "Show passwords"}
                onClick={() => setShown((value) => !value)}
              >
                {shown ? "Hide" : "Show"}
              </button>
            </div>
            {problems.password ? (
              <span id={`${id}-new-err`} className="np-field-error">
                {problems.password}
              </span>
            ) : null}
          </div>
          <div className="nw-field">
            <label className="nw-label" htmlFor={`${id}-confirm`}>
              Confirm new password
            </label>
            <input
              id={`${id}-confirm`}
              className="nw-input"
              type={type}
              autoComplete="new-password"
              value={confirm}
              onChange={edit(setConfirm, "confirm")}
              aria-invalid={problems.confirm ? "true" : undefined}
              aria-describedby={problems.confirm ? `${id}-confirm-err` : undefined}
              disabled={busy}
            />
            {problems.confirm ? (
              <span id={`${id}-confirm-err`} className="np-field-error">
                {problems.confirm}
              </span>
            ) : null}
          </div>
        </div>
        {error ? <Alert onDismiss={() => setError("")}>{error}</Alert> : null}
        <div className="np-form-foot">
          {saved ? (
            <p className="np-saved" role="status">
              <IconCheck size={16} strokeWidth={2.2} />
              Password changed. Use it the next time you sign in.
            </p>
          ) : (
            <p id={`${id}-rule`} className="nw-hint">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
          <button type="submit" className="nw-btn nw-btn-primary" disabled={busy}>
            {busy ? "Changing…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}

// The signed-in person's own page, from the account menu: who they are,
// their password, connected apps (Discord) and signing out.
export default function ProfilePage({ account, organization, onSignOut }) {
  return (
    <div className="nw-page np-page">
      <div className="nw-head">
        <div>
          <h1 className="nw-h1">Profile</h1>
          <p className="nw-lede">Your account details, password and connected apps.</p>
        </div>
      </div>

      <Details account={account} organization={organization} />
      <Password email={account.email} />

      <section className="np-card" aria-labelledby="np-apps-h">
        <div className="np-card-head">
          <h2 id="np-apps-h" className="nw-h2">
            Connected apps
          </h2>
          <p className="nw-hint">Use Nautilus from apps you already work in.</p>
        </div>
        <DiscordConnection />
      </section>

      <section className="np-card np-card-row" aria-labelledby="np-out-h">
        <div className="np-card-head">
          <h2 id="np-out-h" className="nw-h2">
            Sign out
          </h2>
          <p className="nw-hint">Sign out of Nautilus on this device.</p>
        </div>
        <button type="button" className="nw-btn nw-btn-secondary" onClick={onSignOut}>
          <IconSignOut />
          Sign out
        </button>
      </section>
    </div>
  );
}
