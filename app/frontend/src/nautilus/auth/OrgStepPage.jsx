import { useState } from 'react';
import Logo from '../app/Logo.jsx';
import { Message } from './AuthParts.jsx';
import { orgErrorMessage } from './orgErrors.js';
import useAuthPage from './useAuthPage.js';
import './auth.css';

// the page root: background, text colour and type for everything inside
const ROOT_STYLE = { minHeight: "100vh", boxSizing: "border-box", background: "#F1F7F8", color: "#102C33", fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: "15px", lineHeight: "1.5", display: "flex", flexDirection: "column", gap: "32px", padding: "28px 24px 64px" };
const CARD_STYLE = { background: "#FFFFFF", border: "1px solid #DCEBEE", borderRadius: "18px", padding: "28px", display: "flex", flexDirection: "column", gap: "12px" };
const INPUT_STYLE = { height: "46px", boxSizing: "border-box", borderRadius: "10px", padding: "0 12px", font: "inherit", color: "#102C33", background: "#FFFFFF" };
const BUTTON_STYLE = { display: "flex", alignItems: "center", justifyContent: "center", height: "46px", marginTop: "auto", borderRadius: "10px", fontWeight: "600" };

// "One more step": a signed-in account with no organization yet (a Google
// sign-up, or a join code that didn't work) joins one with a code or starts
// its own. Props:
//   email                      the signed-in account, shown with Sign out
//   error                      a message above both cards, e.g. why the sign-up's code was refused
//   defaultValues              { joinCode, orgName } to start the fields with
//   onJoin(code), onCreate(name)   return promises; a rejection shows its message on that card
//   onSignOut()
export default function OrgStepPage({ email, error = '', defaultValues, onJoin, onCreate, onSignOut }) {
  useAuthPage('Nautilus — One more step');
  const values = { joinCode: '', orgName: '', ...defaultValues };
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState({ join: error, create: '' });

  function submit(kind, call) {
    return (event) => {
      event.preventDefault();
      const value = String(new FormData(event.currentTarget).get('value')).trim();
      if (!value) return;
      setBusy(kind);
      setProblem({ join: '', create: '' });
      Promise.resolve(call(value)).catch((reason) => {
        setBusy(null);
        setProblem((current) => ({ ...current, [kind]: orgErrorMessage(reason) }));
      });
    };
  }

  return (
    <div className="nautilus-auth au-signin" style={ROOT_STYLE}>
      <header style={{ maxWidth: "1000px", width: "100%", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", padding: "4px 0" }}>
          <Logo height={22} />
        </span>
        <span style={{ fontSize: "14px", color: "#557479" }}>
          Signed in as {email} ·{' '}
          <button type="button" onClick={onSignOut} style={{ border: "0", padding: "0", background: "none", font: "inherit", color: "#1D6F7A", cursor: "pointer", textDecoration: "underline" }}>
            Sign out
          </button>
        </span>
      </header>

      <main style={{ maxWidth: "1000px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "6px", alignItems: "center" }}>
          <h1 style={{ margin: "0", fontSize: "32px", letterSpacing: "-0.025em", fontWeight: "650" }}>One more <span className="au-serif">step</span></h1>
          <p style={{ margin: "0", color: "#557479", maxWidth: "520px" }}>Every PRD lives in an organization. Join the one your team already has, or start a new one.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: "20px", alignItems: "stretch" }}>
          <form onSubmit={submit('join', onJoin)} aria-labelledby="os-join-h" style={CARD_STYLE}>
            <h2 id="os-join-h" style={{ margin: "0", fontSize: "20px", fontWeight: "650", letterSpacing: "-0.015em" }}>Join an organization</h2>
            <p style={{ margin: "0", color: "#3E5A60" }}>Ask your admin for the join code. You’ll join as a member.</p>
            <label htmlFor="os-code" style={{ fontWeight: "500", fontSize: "14px" }}>Join code</label>
            <input id="os-code" name="value" type="text" required maxLength={50} defaultValue={values.joinCode} autoComplete="off" spellCheck="false" placeholder="XXXX-XXXX-XXXX" className="au-input" style={{ ...INPUT_STYLE, fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: "0.06em" }} />
            <Message error={problem.join} />
            <button type="submit" disabled={busy !== null} className="au-primary" style={{ ...BUTTON_STYLE, background: "#85D1DB", color: "#102C33" }}>
              {busy === 'join' ? 'Joining…' : 'Join'}
            </button>
          </form>

          <form onSubmit={submit('create', onCreate)} aria-labelledby="os-create-h" style={CARD_STYLE}>
            <h2 id="os-create-h" style={{ margin: "0", fontSize: "20px", fontWeight: "650", letterSpacing: "-0.015em" }}>Start an organization</h2>
            <p style={{ margin: "0", color: "#3E5A60" }}>For a new team. You’ll be its admin and can invite people with a join code.</p>
            <label htmlFor="os-org" style={{ fontWeight: "500", fontSize: "14px" }}>Organization name</label>
            <input id="os-org" name="value" type="text" required maxLength={200} defaultValue={values.orgName} autoComplete="organization" className="au-input" style={INPUT_STYLE} />
            <Message error={problem.create} />
            <button type="submit" disabled={busy !== null} className="au-primary" style={{ ...BUTTON_STYLE, border: "1px solid #C3DADE", background: "#FFFFFF", color: "#102C33" }}>
              {busy === 'create' ? 'Creating…' : 'Create organization'}
            </button>
          </form>
        </div>

        <p style={{ margin: "0", textAlign: "center", fontSize: "13px", color: "#557479" }}>One organization per account. In two organizations? Use a second account.</p>
      </main>
    </div>
  );
}
