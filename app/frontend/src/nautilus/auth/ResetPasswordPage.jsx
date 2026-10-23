import { useState } from 'react';
import links from '../links.js';
import { followLink } from '../page.js';
import { Message, PasswordRule } from './AuthParts.jsx';
import useAuthPage from './useAuthPage.js';
import './auth.css';

// Not from the design canvas: a plain screen built from the sign-in page's
// shell and the sign-up page's password field, for Supabase's recovery link.

// the page root, the same as the sign-in page's
const ROOT_STYLE = { position: "relative", overflow: "hidden", minHeight: "100vh", boxSizing: "border-box", background: "#F1F7F8", color: "#102C33", fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: "15px", lineHeight: "1.5", display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 16px 116px", gap: "32px" };

// what the new password needs; the list under the field ticks them off as you type
const RULES = [
  { label: '8+ characters', test: (p) => p.length >= 8, required: true },
  { label: 'A number', test: (p) => /\d/.test(p), required: true },
  { label: 'A symbol (recommended)', test: (p) => /[^A-Za-z0-9\s]/.test(p), required: false },
];

// Choose a new password. Shown once Supabase reports a recovery link was opened.
// Props (all optional):
//   onSubmit({ password })   the form was sent, and the password meets the required rules
//   error, notice      a message above the button: error in red, notice in aqua
//   busy               disables the button while the request is out
//   onNavigate(path)   routes the page's links client-side
//   title              the browser tab title (null leaves it alone)
export default function ResetPasswordPage({ onSubmit, error = '', notice = '', busy = false, onNavigate, title }) {
  useAuthPage(title === undefined ? 'Nautilus — Choose a new password' : title);
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState('');
  const rules = RULES.map((r) => ({ label: r.label, met: r.test(password) }));

  function changePassword(e) {
    setPassword(e.target.value);
    if (problem) setProblem('');
  }

  function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pass = String(form.get('password'));
    if (!RULES.every((r) => !r.required || r.test(pass))) {
      setProblem('Use at least 8 characters, including a number.');
      return;
    }
    onSubmit?.({ password: pass });
  }

  return (
    <div className="nautilus-auth au-signin" onClick={(e) => followLink(e, onNavigate)} style={ROOT_STYLE}>
      <a href={links.home} className="au-logo-link" aria-label="Nautilus home" style={{ display: "flex", alignItems: "center", padding: "4px 0", textDecoration: "none", color: "#102C33" }}>
        <svg className="au-logo" width="116.8" height="26" viewBox="68 -792 3610 804" aria-hidden="true">
          <path fill="currentColor" d="M68 -535H194L199 -382L182 -387Q194 -470 240 -508Q286 -547 356 -547Q442 -547 490 -492Q538 -438 538 -344V0H399V-298Q399 -368 379 -402Q360 -436 312 -436Q262 -436 234 -400Q207 -364 207 -298V0H68Z M599 -134Q599 -203 642 -242Q684 -281 774 -299L949 -334Q949 -388 924 -416Q900 -443 852 -443Q808 -443 782 -423Q757 -402 748 -363L608 -370Q623 -456 686 -502Q750 -547 852 -547Q968 -547 1028 -490Q1088 -433 1088 -324V-136Q1088 -114 1095 -106Q1102 -98 1118 -98H1134V0Q1126 2 1112 4Q1098 5 1084 5Q1029 5 998 -22Q967 -50 967 -117L979 -108Q966 -54 914 -21Q862 12 786 12Q701 12 650 -27Q599 -66 599 -134ZM949 -215V-243L819 -216Q780 -208 761 -191Q742 -174 742 -147Q742 -118 762 -102Q780 -86 817 -86Q857 -86 887 -102Q916 -118 933 -147Q949 -176 949 -215Z M1189 -190V-535H1328V-224Q1328 -160 1349 -130Q1370 -100 1413 -100Q1462 -100 1489 -133Q1516 -166 1516 -230V-535H1655V0H1528L1524 -150L1542 -146Q1530 -68 1485 -28Q1440 12 1365 12Q1282 12 1236 -41Q1189 -94 1189 -190Z M1804 -157V-660H1943V-172Q1943 -135 1959 -120Q1974 -106 2009 -106H2084V0H1962Q1880 0 1842 -38Q1804 -76 1804 -157ZM1719 -535H2084V-430H1719Z M2147 -535H2286V0H2147Z M2387 -133 2388 -710H2526V-148Q2526 -126 2537 -116Q2548 -106 2568 -106H2606V0H2522Q2457 0 2422 -32Q2387 -64 2387 -133Z M2665 -190V-535H2804V-224Q2804 -160 2825 -130Q2846 -100 2889 -100Q2938 -100 2965 -133Q2992 -166 2992 -230V-535H3131V0H3004L3000 -150L3018 -146Q3006 -68 2961 -28Q2916 12 2841 12Q2758 12 2712 -41Q2665 -94 2665 -190Z M3191 -168 3332 -174Q3340 -133 3366 -112Q3394 -90 3444 -90Q3488 -90 3512 -104Q3535 -118 3535 -146Q3535 -164 3526 -176Q3518 -188 3493 -196Q3469 -205 3422 -213Q3338 -227 3291 -248Q3244 -268 3224 -299Q3204 -330 3204 -377Q3204 -454 3264 -501Q3324 -547 3436 -547Q3542 -547 3602 -497Q3662 -448 3674 -365L3534 -359Q3528 -400 3502 -422Q3476 -445 3434 -445Q3392 -445 3370 -428Q3348 -410 3348 -382Q3348 -362 3358 -348Q3368 -335 3390 -327Q3412 -318 3452 -312Q3537 -300 3586 -279Q3636 -258 3657 -227Q3678 -196 3678 -149Q3678 -72 3615 -30Q3552 12 3444 12Q3366 12 3310 -11Q3254 -34 3224 -74Q3195 -115 3191 -168Z" />
          <circle className="au-logo-dot" cx="2216" cy="-702" r="90" fill="#4FAAB7" />
        </svg>
      </a>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: "420px", boxSizing: "border-box", background: "#FFFFFF", border: "1px solid #DCEBEE", borderRadius: "16px", padding: "36px 32px", display: "flex", flexDirection: "column", gap: "20px", boxShadow: "0 1px 2px rgba(16,44,51,0.04), 0 12px 32px -16px rgba(16,44,51,0.12)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", textAlign: "center" }}>
          <h1 style={{ margin: "0", fontSize: "26px", letterSpacing: "-0.02em", fontWeight: "650" }}>Choose a new <span className="au-serif">password</span></h1>
          <p style={{ margin: "0", color: "#557479" }}>Then you will be signed in with it.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label htmlFor="rp-pass" style={{ fontWeight: "500", fontSize: "14px" }}>New password</label>
          <input id="rp-pass" name="password" type="password" required onChange={changePassword} autoComplete="new-password" aria-describedby="rp-pass-hint" className="au-input" style={{ height: "44px", boxSizing: "border-box", borderRadius: "9px", padding: "0 12px", font: "inherit", color: "#102C33", background: "#FFFFFF" }} />
          <div id="rp-pass-hint" style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: "13px" }}>
            {rules.map((rule) => (
              <PasswordRule key={rule.label} {...rule} />
            ))}
          </div>
        </div>
        <Message error={problem || error} notice={problem ? "" : notice} />
        <button type="submit" disabled={busy} className="au-primary" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "48px", borderRadius: "10px", background: "#85D1DB", color: "#102C33", fontWeight: "600" }}>{busy ? "Saving…" : "Save new password"}</button>
      </form>
      <p style={{ margin: "0", fontSize: "14px", color: "#3E5A60" }}>Changed your mind? <a href={links.signIn} style={{ fontWeight: "500" }}>Back to sign in</a></p>
    </div>
  );
}
