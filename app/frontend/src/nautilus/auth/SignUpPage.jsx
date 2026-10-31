import { useState } from 'react';
import links from '../links.js';
import { followLink } from '../page.js';
import { Message, PasswordRule } from './AuthParts.jsx';
import useAuthPage from './useAuthPage.js';
import './auth.css';

// the page root: background, text colour and type for everything inside
const ROOT_STYLE = { minHeight: "100vh", display: "flex", flexWrap: "wrap", background: "#FFFFFF", color: "#102C33", fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: "15px", lineHeight: "1.5" };

// what the password needs; the list under the field ticks them off as you type
const RULES = [
  { label: '8+ characters', test: (p) => p.length >= 8, required: true },
  { label: 'A number', test: (p) => /\d/.test(p), required: true },
  { label: 'A symbol (recommended)', test: (p) => /[^A-Za-z0-9\s]/.test(p), required: false },
];

// the two ways in: join an existing organization with its code, or start a new one
const TAB_STYLE = { height: "40px", border: "0", borderRadius: "8px", font: "inherit", fontSize: "14px", cursor: "pointer" };
const TAB_ON = { ...TAB_STYLE, background: "#FFFFFF", color: "#102C33", fontWeight: "600", boxShadow: "0 1px 3px rgba(16,44,51,0.15)" };
const TAB_OFF = { ...TAB_STYLE, background: "transparent", color: "#3E5A60", fontWeight: "500" };

// Sign up. Props (all optional):
//   onSubmit({ name, email, password, orgMode, orgName, joinCode })
//                      the form was sent: all three filled in, the password meets the required rules, and
//                      orgMode is "join" (with joinCode) or "create" (with orgName)
//   onGoogle()                            "Continue with Google"
//   onNavigate(path)   routes the page's links ("/", "/signin", "/signup") client-side; without it they are plain links
//   error, notice      a message above the main button: error in red, notice (e.g. "Check your inbox") in aqua
//   busy               disables the buttons while a request is out
//   defaultValues      fields start empty unless given here; title: the tab title (null leaves it alone)
export default function SignUpPage({ onSubmit, onGoogle, error = '', notice = '', busy = false, onNavigate, defaultValues, title }) {
  useAuthPage(title === undefined ? 'Nautilus — Sign up' : title);
  const values = { name: '', email: '', password: '', orgMode: 'join', orgName: '', joinCode: '', ...defaultValues };
  const [password, setPassword] = useState(values.password);
  const [orgMode, setOrgMode] = useState(values.orgMode);
  const joining = orgMode === 'join';
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
    onSubmit?.({
      name: String(form.get('name')).trim(),
      email: String(form.get('email')).trim(),
      password: pass,
      orgMode,
      orgName: joining ? '' : String(form.get('orgName')).trim(),
      joinCode: joining ? String(form.get('joinCode')).trim() : '',
    });
  }
  const google = () => onGoogle?.();

  return (
    <div className="nautilus-auth au-signup" onClick={(e) => followLink(e, onNavigate)} style={ROOT_STYLE}>
      <main style={{ flex: "1 1 520px", minWidth: "0", display: "flex", flexDirection: "column", padding: "32px 24px" }}>
        <a href={links.home} className="au-logo-link" aria-label="Nautilus home" style={{ display: "flex", alignItems: "center", padding: "4px 0", textDecoration: "none", color: "#102C33", alignSelf: "flex-start" }}>
          <svg className="au-logo" width="98.8" height="22" viewBox="68 -792 3610 804" aria-hidden="true">
            <path fill="currentColor" d="M68 -535H194L199 -382L182 -387Q194 -470 240 -508Q286 -547 356 -547Q442 -547 490 -492Q538 -438 538 -344V0H399V-298Q399 -368 379 -402Q360 -436 312 -436Q262 -436 234 -400Q207 -364 207 -298V0H68Z M599 -134Q599 -203 642 -242Q684 -281 774 -299L949 -334Q949 -388 924 -416Q900 -443 852 -443Q808 -443 782 -423Q757 -402 748 -363L608 -370Q623 -456 686 -502Q750 -547 852 -547Q968 -547 1028 -490Q1088 -433 1088 -324V-136Q1088 -114 1095 -106Q1102 -98 1118 -98H1134V0Q1126 2 1112 4Q1098 5 1084 5Q1029 5 998 -22Q967 -50 967 -117L979 -108Q966 -54 914 -21Q862 12 786 12Q701 12 650 -27Q599 -66 599 -134ZM949 -215V-243L819 -216Q780 -208 761 -191Q742 -174 742 -147Q742 -118 762 -102Q780 -86 817 -86Q857 -86 887 -102Q916 -118 933 -147Q949 -176 949 -215Z M1189 -190V-535H1328V-224Q1328 -160 1349 -130Q1370 -100 1413 -100Q1462 -100 1489 -133Q1516 -166 1516 -230V-535H1655V0H1528L1524 -150L1542 -146Q1530 -68 1485 -28Q1440 12 1365 12Q1282 12 1236 -41Q1189 -94 1189 -190Z M1804 -157V-660H1943V-172Q1943 -135 1959 -120Q1974 -106 2009 -106H2084V0H1962Q1880 0 1842 -38Q1804 -76 1804 -157ZM1719 -535H2084V-430H1719Z M2147 -535H2286V0H2147Z M2387 -133 2388 -710H2526V-148Q2526 -126 2537 -116Q2548 -106 2568 -106H2606V0H2522Q2457 0 2422 -32Q2387 -64 2387 -133Z M2665 -190V-535H2804V-224Q2804 -160 2825 -130Q2846 -100 2889 -100Q2938 -100 2965 -133Q2992 -166 2992 -230V-535H3131V0H3004L3000 -150L3018 -146Q3006 -68 2961 -28Q2916 12 2841 12Q2758 12 2712 -41Q2665 -94 2665 -190Z M3191 -168 3332 -174Q3340 -133 3366 -112Q3394 -90 3444 -90Q3488 -90 3512 -104Q3535 -118 3535 -146Q3535 -164 3526 -176Q3518 -188 3493 -196Q3469 -205 3422 -213Q3338 -227 3291 -248Q3244 -268 3224 -299Q3204 -330 3204 -377Q3204 -454 3264 -501Q3324 -547 3436 -547Q3542 -547 3602 -497Q3662 -448 3674 -365L3534 -359Q3528 -400 3502 -422Q3476 -445 3434 -445Q3392 -445 3370 -428Q3348 -410 3348 -382Q3348 -362 3358 -348Q3368 -335 3390 -327Q3412 -318 3452 -312Q3537 -300 3586 -279Q3636 -258 3657 -227Q3678 -196 3678 -149Q3678 -72 3615 -30Q3552 12 3444 12Q3366 12 3310 -11Q3254 -34 3224 -74Q3195 -115 3191 -168Z" />
            <circle className="au-logo-dot" cx="2216" cy="-702" r="90" fill="#4FAAB7" />
          </svg>
        </a>
        <div style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0" }}>
          <form onSubmit={submit} style={{ width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", gap: "22px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <h1 style={{ margin: "0", fontSize: "30px", letterSpacing: "-0.025em", fontWeight: "650" }}>Create your <span className="au-serif">account</span></h1>
              <p style={{ margin: "0", color: "#557479" }}>Your first PRD is about fifteen minutes away.</p>
            </div>
            <div role="tablist" aria-label="How you’re joining Nautilus" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "4px", padding: "4px", borderRadius: "11px", background: "#EAF3F5" }}>
              <button type="button" role="tab" aria-selected={joining} onClick={() => setOrgMode('join')} style={joining ? TAB_ON : TAB_OFF}>Join an organization</button>
              <button type="button" role="tab" aria-selected={!joining} onClick={() => setOrgMode('create')} style={joining ? TAB_OFF : TAB_ON}>Start an organization</button>
            </div>
            <button type="button" onClick={google} disabled={busy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", height: "46px", borderRadius: "10px", border: "1px solid #C3DADE", background: "#FFFFFF", color: "#102C33", font: "inherit", fontWeight: "500", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 12h8" />
              </svg>
              Continue with Google
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#557479", fontSize: "13px" }}><span style={{ flex: "1", height: "1px", background: "#DCEBEE" }} />or sign up with email<span style={{ flex: "1", height: "1px", background: "#DCEBEE" }} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {joining ? (
                <div key="join" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="su-code" style={{ fontWeight: "500", fontSize: "14px" }}>Join code</label>
                  <input id="su-code" name="joinCode" type="text" required maxLength={50} defaultValue={values.joinCode} autoComplete="off" spellCheck="false" placeholder="XXXX-XXXX-XXXX" aria-describedby="su-code-hint" className="au-input" style={{ height: "44px", boxSizing: "border-box", borderRadius: "9px", padding: "0 12px", font: "inherit", fontFamily: "'Geist Mono', ui-monospace, monospace", letterSpacing: "0.06em", color: "#102C33", background: "#FFFFFF" }} />
                  <span id="su-code-hint" style={{ fontSize: "13px", color: "#557479" }}>Ask your organization’s admin. You’ll join as a member.</span>
                </div>
              ) : (
                <div key="create" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="su-org" style={{ fontWeight: "500", fontSize: "14px" }}>Organization name</label>
                  <input id="su-org" name="orgName" type="text" required maxLength={200} defaultValue={values.orgName} autoComplete="organization" aria-describedby="su-org-hint" className="au-input" style={{ height: "44px", boxSizing: "border-box", borderRadius: "9px", padding: "0 12px", font: "inherit", color: "#102C33", background: "#FFFFFF" }} />
                  <span id="su-org-hint" style={{ fontSize: "13px", color: "#557479" }}>You’ll be its admin and can invite your team with a join code.</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor="su-name" style={{ fontWeight: "500", fontSize: "14px" }}>Full name</label>
                <input id="su-name" name="name" type="text" required defaultValue={values.name} autoComplete="name" className="au-input" style={{ height: "44px", boxSizing: "border-box", borderRadius: "9px", padding: "0 12px", font: "inherit", color: "#102C33", background: "#FFFFFF" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor="su-email" style={{ fontWeight: "500", fontSize: "14px" }}>Email</label>
                <input id="su-email" name="email" type="email" required defaultValue={values.email} autoComplete="email" className="au-input" style={{ height: "44px", boxSizing: "border-box", borderRadius: "9px", padding: "0 12px", font: "inherit", color: "#102C33", background: "#FFFFFF" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor="su-pass" style={{ fontWeight: "500", fontSize: "14px" }}>Password</label>
                <input id="su-pass" name="password" type="password" required defaultValue={values.password} onChange={changePassword} autoComplete="new-password" aria-describedby="su-pass-hint" className="au-input" style={{ height: "44px", boxSizing: "border-box", borderRadius: "9px", padding: "0 12px", font: "inherit", color: "#102C33", background: "#FFFFFF" }} />
                <div id="su-pass-hint" style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: "13px" }}>
                  {rules.map((rule) => (
                    <PasswordRule key={rule.label} {...rule} />
                  ))}
                </div>
              </div>
            </div>
            <Message error={problem || error} notice={problem ? "" : notice} />
            <button type="submit" disabled={busy} className="au-primary" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "48px", borderRadius: "10px", background: "#85D1DB", color: "#102C33", fontWeight: "600" }}>{busy ? "Creating account…" : joining ? "Create account & join" : "Create account & organization"}</button>
            <p style={{ margin: "0", fontSize: "13px", color: "#557479" }}>By creating an account you agree to the <a href={links.terms}>Terms</a> and <a href={links.privacy}>Privacy Policy</a>.</p>
            <p style={{ margin: "0", paddingTop: "8px", borderTop: "1px solid #DCEBEE", fontSize: "14px", color: "#3E5A60" }}>Already have an account? <a href={links.signIn} style={{ fontWeight: "500" }}>Sign in</a></p>
          </form>
        </div>
      </main>
      <aside aria-label="About Nautilus" className="au-sea-aqua" style={{ position: "relative", overflow: "hidden", flex: "1 1 520px", minWidth: "0", background: "#85D1DB", color: "#102C33", padding: "56px 48px 230px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center", gap: "32px" }}>
        <div style={{ position: "relative", zIndex: "1", display: "flex", flexDirection: "column", gap: "12px", maxWidth: "520px" }}>
          <div style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: "13px", color: "#1E4950" }}>WHAT YOU’LL GET</div>
          <h2 style={{ margin: "0", fontSize: "30px", lineHeight: "1.15", letterSpacing: "-0.025em", fontWeight: "600" }}>Seven guided questions in. <span className="au-serif au-hl au-hl-w">A structured, editable PRD out.</span></h2>
        </div>
        <div style={{ position: "relative", zIndex: "1", maxWidth: "520px", background: "#FFFFFF", color: "#102C33", borderRadius: "12px", padding: "22px 24px", display: "flex", flexDirection: "column", gap: "12px", boxShadow: "0 24px 48px -20px rgba(16,44,51,0.4)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}><span style={{ fontFamily: "'Geist Mono', ui-monospace, monospace", fontSize: "12px", color: "#557479" }}>§2</span><span style={{ fontWeight: "600", fontSize: "17px" }}>Goals</span></div>
          <ol style={{ margin: "0", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px", color: "#3E5A60", fontSize: "14px" }}>
            <li>Help students find an active study group for each enrolled course within their first week of term.</li>
            <li>Make it easy to coordinate a time and place without a separate group chat.</li>
            <li>Give instructors visibility into peer study activity, without exposing individual students.</li>
          </ol>
        </div>
        <ul style={{ position: "relative", zIndex: "1", margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", color: "#1E4950", maxWidth: "520px" }}>
          <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#102C33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
              <path d="m5 12 5 5L20 7" />
            </svg>Nine standard PRD sections, each editable on its own
          </li>
          <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#102C33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
              <path d="m5 12 5 5L20 7" />
            </svg>Regenerate one section without touching the rest
          </li>
          <li style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#102C33" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", marginTop: "2px" }}>
              <path d="m5 12 5 5L20 7" />
            </svg>Comments, approvals and full revision history
          </li>
        </ul>
        {/* the floor of the panel: seaweed, shells and a whale swimming back and forth */}
        <div className="au-sea" aria-hidden="true" style={{ position: "absolute", left: "3%", bottom: "0" }}>
          <svg viewBox="0 0 76 124" width="76" height="124">
            <g className="au-weed au-wd1">
              <path className="au-s4" d="M4 122 L4.7 117.3 L5.3 112.7 L6 108 L6.5 103.3 L6.9 98.7 L7.1 94 L7.1 89.3 L6.8 84.7 L6.2 80 L5.5 75.3 L4.6 70.7 L3.6 66 L2.6 61.3 L1.7 56.7 L1 52 L0.5 47.3 L0.3 42.7 L0.5 38 L1 33.3 L1.7 28.7 L2.8 24 L3.9 19.3 L5.1 14.7 L6.2 10 Q8.9 6.4 11.6 10 L11.6 10 L10.8 14.7 L9.9 19.3 L9 24 L8.2 28.7 L7.7 33.3 L7.5 38 L7.7 42.7 L8.1 47.3 L8.9 52 L9.9 56.7 L11.1 61.3 L12.3 66 L13.6 70.7 L14.7 75.3 L15.8 80 L16.6 84.7 L17.1 89.3 L17.5 94 L17.5 98.7 L17.4 103.3 L17.2 108 L16.8 112.7 L16.4 117.3 L16 122 Z" />
            </g>
            <g className="au-weed au-wd2">
              <path className="au-s1" d="M26 122 L26.6 118.5 L27.3 115 L27.9 111.5 L28.6 108 L29.1 104.5 L29.4 101 L29.6 97.5 L29.6 94 L29.4 90.5 L29 87 L28.6 83.5 L28.1 80 L27.6 76.5 L27.3 73 L27.1 69.5 L27.2 66 L27.6 62.5 L28.3 59 L29.3 55.5 L30.7 52 L32.3 48.5 L34 45 L35.9 41.5 L37.7 38 Q40.1 34.7 42.6 38 L42.6 38 L41.1 41.5 L39.5 45 L38 48.5 L36.6 52 L35.5 55.5 L34.7 59 L34.3 62.5 L34.1 66 L34.3 69.5 L34.7 73 L35.3 76.5 L36 80 L36.8 83.5 L37.5 87 L38.1 90.5 L38.6 94 L38.8 97.5 L38.9 101 L38.8 104.5 L38.5 108 L38.2 111.5 L37.8 115 L37.4 118.5 L37 122 Z" />
            </g>
            <g className="au-weed au-wd3">
              <path className="au-s2" d="M48 122 L48.5 119.6 L49.1 117.2 L49.6 114.8 L50 112.3 L50.4 109.9 L50.5 107.5 L50.5 105.1 L50.3 102.7 L49.9 100.2 L49.3 97.8 L48.6 95.4 L47.8 93 L47 90.6 L46.3 88.2 L45.8 85.8 L45.4 83.3 L45.3 80.9 L45.4 78.5 L45.8 76.1 L46.4 73.7 L47.3 71.2 L48.2 68.8 L49.2 66.4 L50.1 64 Q52.4 61 54.6 64 L54.6 64 L53.9 66.4 L53.2 68.8 L52.4 71.2 L51.8 73.7 L51.4 76.1 L51.3 78.5 L51.4 80.9 L51.7 83.3 L52.3 85.8 L53.1 88.2 L54 90.6 L55 93 L56 95.4 L57 97.8 L57.8 100.2 L58.4 102.7 L58.9 105.1 L59.1 107.5 L59.2 109.9 L59.1 112.3 L58.9 114.8 L58.6 117.2 L58.3 119.6 L58 122 Z" />
            </g>
          </svg>
        </div>
        <div className="au-sea" aria-hidden="true" style={{ position: "absolute", right: "3%", bottom: "0" }}>
          <svg viewBox="0 0 76 124" width="56" height="92" style={{ transform: "scaleX(-1)" }}>
            <g className="au-weed au-wd1">
              <path className="au-s4" d="M4 122 L4.7 117.3 L5.3 112.7 L6 108 L6.5 103.3 L6.9 98.7 L7.1 94 L7.1 89.3 L6.8 84.7 L6.2 80 L5.5 75.3 L4.6 70.7 L3.6 66 L2.6 61.3 L1.7 56.7 L1 52 L0.5 47.3 L0.3 42.7 L0.5 38 L1 33.3 L1.7 28.7 L2.8 24 L3.9 19.3 L5.1 14.7 L6.2 10 Q8.9 6.4 11.6 10 L11.6 10 L10.8 14.7 L9.9 19.3 L9 24 L8.2 28.7 L7.7 33.3 L7.5 38 L7.7 42.7 L8.1 47.3 L8.9 52 L9.9 56.7 L11.1 61.3 L12.3 66 L13.6 70.7 L14.7 75.3 L15.8 80 L16.6 84.7 L17.1 89.3 L17.5 94 L17.5 98.7 L17.4 103.3 L17.2 108 L16.8 112.7 L16.4 117.3 L16 122 Z" />
            </g>
            <g className="au-weed au-wd2">
              <path className="au-s1" d="M26 122 L26.6 118.5 L27.3 115 L27.9 111.5 L28.6 108 L29.1 104.5 L29.4 101 L29.6 97.5 L29.6 94 L29.4 90.5 L29 87 L28.6 83.5 L28.1 80 L27.6 76.5 L27.3 73 L27.1 69.5 L27.2 66 L27.6 62.5 L28.3 59 L29.3 55.5 L30.7 52 L32.3 48.5 L34 45 L35.9 41.5 L37.7 38 Q40.1 34.7 42.6 38 L42.6 38 L41.1 41.5 L39.5 45 L38 48.5 L36.6 52 L35.5 55.5 L34.7 59 L34.3 62.5 L34.1 66 L34.3 69.5 L34.7 73 L35.3 76.5 L36 80 L36.8 83.5 L37.5 87 L38.1 90.5 L38.6 94 L38.8 97.5 L38.9 101 L38.8 104.5 L38.5 108 L38.2 111.5 L37.8 115 L37.4 118.5 L37 122 Z" />
            </g>
            <g className="au-weed au-wd3">
              <path className="au-s2" d="M48 122 L48.5 119.6 L49.1 117.2 L49.6 114.8 L50 112.3 L50.4 109.9 L50.5 107.5 L50.5 105.1 L50.3 102.7 L49.9 100.2 L49.3 97.8 L48.6 95.4 L47.8 93 L47 90.6 L46.3 88.2 L45.8 85.8 L45.4 83.3 L45.3 80.9 L45.4 78.5 L45.8 76.1 L46.4 73.7 L47.3 71.2 L48.2 68.8 L49.2 66.4 L50.1 64 Q52.4 61 54.6 64 L54.6 64 L53.9 66.4 L53.2 68.8 L52.4 71.2 L51.8 73.7 L51.4 76.1 L51.3 78.5 L51.4 80.9 L51.7 83.3 L52.3 85.8 L53.1 88.2 L54 90.6 L55 93 L56 95.4 L57 97.8 L57.8 100.2 L58.4 102.7 L58.9 105.1 L59.1 107.5 L59.2 109.9 L59.1 112.3 L58.9 114.8 L58.6 117.2 L58.3 119.6 L58 122 Z" />
            </g>
          </svg>
        </div>
        <span className="au-sea" style={{ position: "absolute", left: "18%", bottom: "8px", rotate: "-10deg" }}>
          <svg viewBox="0 9 48 36" width="34" height="25.5">
            <path className="au-h1 au-hk" d="M14 35 L34 35 L31 42.5 L17 42.5 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="au-h1 au-hk" d="M20.5 38 L2.4 30.1 Q1 24.7 6.4 23.2 Q6.9 17.6 12.5 18.1 Q14.9 13 20 15.3 Q24 11.4 28 15.3 Q33.1 13 35.5 18.1 Q41.1 17.6 41.6 23.2 Q47 24.7 45.6 30.1 L27.5 38 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="au-hk" d="M18.6 33.5 L7.5 24.2M20.5 31.9 L13.3 19.4M22.8 31.1 L20.3 16.8M25.2 31.1 L27.7 16.8M27.5 31.9 L34.8 19.4M29.4 33.5 L40.5 24.2" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span><span className="au-sea" style={{ position: "absolute", left: "44%", bottom: "7px" }}>
          <svg viewBox="0 4 52 38" width="44" height="32.2">
            <path className="au-h1 au-hk" d="M3 26 C5 35 14 39 26 39 C38 39 47 34 49 26 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="au-hk" d="M4.4 27.5 Q7.6 33.4 10.7 36.4M5.8 27.5 Q12.2 33.8 18.3 37.3M7.1 27.5 Q16.8 34.2 26 38.2M8.5 27.5 Q21.4 34.6 33.7 37.3M9.9 27.5 Q26 35 41.3 36.4" fill="none" strokeWidth="1.5" strokeLinecap="round" />
            <path className="au-h3" d="M5 26 C12 23.5 40 23.5 47 26 C40 28 12 28 5 26 Z" />
            <circle className="au-h4 au-hk" cx="30" cy="22" r="5.2" strokeWidth="1.6" />
            <circle className="au-h3" cx="28.2" cy="20.3" r="1.5" />
            <g className="au-clam-lid">
              <path className="au-h1 au-hk" d="M3 26 C5 17 14 12 26 12 C38 12 47 18 49 26 Z" strokeWidth="2" strokeLinejoin="round" />
              <path className="au-hk" d="M4.4 24.5 Q7.6 17.7 10.7 14.9M5.8 24.5 Q12.2 17.4 18.3 13.9M7.1 24.5 Q16.8 17.1 26 12.8M8.5 24.5 Q21.4 16.8 33.7 13.9M9.9 24.5 Q26 16.5 41.3 14.9" fill="none" strokeWidth="1.5" strokeLinecap="round" />
            </g>
          </svg>
        </span><span className="au-sea" style={{ position: "absolute", right: "18%", bottom: "9px", rotate: "18deg" }}>
          <svg viewBox="0 0 40 40" width="28" height="28">
            <circle className="au-h1 au-hk" cx="20" cy="20" r="17" strokeWidth="2" />
            <ellipse className="au-h3 au-hk" cx="20" cy="12.8" rx="5" ry="2.3" transform="rotate(-90 20 12.8)" strokeWidth="1.4" />
            <ellipse className="au-h3 au-hk" cx="26.8" cy="17.8" rx="5" ry="2.3" transform="rotate(-18 26.8 17.8)" strokeWidth="1.4" />
            <ellipse className="au-h3 au-hk" cx="24.2" cy="25.8" rx="5" ry="2.3" transform="rotate(54 24.2 25.8)" strokeWidth="1.4" />
            <ellipse className="au-h3 au-hk" cx="15.8" cy="25.8" rx="5" ry="2.3" transform="rotate(126 15.8 25.8)" strokeWidth="1.4" />
            <ellipse className="au-h3 au-hk" cx="13.2" cy="17.8" rx="5" ry="2.3" transform="rotate(198 13.2 17.8)" strokeWidth="1.4" />
            <circle className="au-hk2" cx="20" cy="20" r="1.6" />
          </svg>
        </span>
        <div className="au-sea au-su-whale" aria-hidden="true">
          <div className="au-whale-bob">
            <svg viewBox="0 0 330 230" width="190" height="132">
              <g className="au-spout">
                <path className="au-kw" d="M122 56 L122 22" fill="none" strokeWidth="6" strokeLinecap="round" />
                <path className="au-kw" d="M122 56 C121 40 112 30 99 25" fill="none" strokeWidth="5.5" strokeLinecap="round" />
                <path className="au-kw" d="M122 56 C123 40 132 30 145 25" fill="none" strokeWidth="5.5" strokeLinecap="round" />
              </g>
              <g className="au-drops">
                <circle className="au-sw au-drop" cx="95" cy="19" r="5.5" />
                <circle className="au-sw au-drop" cx="122" cy="13" r="6" />
                <circle className="au-sw au-drop" cx="149" cy="19" r="5.5" />
              </g>
              <g className="au-w-fluke">
                <path className="au-s1" d="M262 128 C270 104 286 88 310 80 C312 100 300 116 282 128 Z" />
                <path className="au-s1" d="M262 128 C280 116 304 114 326 122 C314 138 292 142 262 134 Z" />
              </g>
              <path className="au-s1" d="M20 132 C18 86 62 54 124 52 C182 50 226 72 250 104 C258 114 266 122 278 126 L286 128 C276 144 256 156 228 162 C190 172 142 176 102 172 C52 167 22 156 20 132 Z" />
              <path className="au-s3" d="M30 146 C52 164 96 172 146 172 C184 172 214 166 236 158 C212 152 180 150 146 150 C100 150 60 152 30 146 Z" />
              <g className="au-k4" fill="none" strokeWidth="2.6" strokeLinecap="round">
                <path d="M64 160 C94 166 124 167 152 165" />
                <path d="M86 168 C110 171 132 171 152 170" />
              </g>
              <g className="au-s4">
                <circle cx="152" cy="74" r="6" />
                <circle cx="174" cy="70" r="4.2" />
                <circle cx="192" cy="80" r="3.2" />
              </g>
              <path className="au-k2" d="M113 59 q9 -4 18 0" fill="none" strokeWidth="3.4" strokeLinecap="round" />
              <path className="au-s2 au-w-flip" d="M142 146 C154 162 152 186 130 200 C124 180 128 160 142 146 Z" />
              <ellipse className="au-s4" cx="112" cy="132" rx="11" ry="6.5" />
              <g className="au-w-eye">
                <circle className="au-sw" cx="90" cy="106" r="11.5" />
                <circle className="au-se" cx="86.5" cy="107.5" r="7" />
                <circle className="au-sw" cx="89.5" cy="103.5" r="2.6" />
              </g>
              <path className="au-ke" d="M26 134 C44 150 74 154 100 142" fill="none" strokeWidth="3.6" strokeLinecap="round" />
              <path className="au-ke" d="M100 142 q6 -2 8 -8" fill="none" strokeWidth="3.2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="au-bubble au-b-sm" style={{ left: "3%", top: "56%", animationDelay: ".3s" }} /><span className="au-bubble" style={{ left: "8%", top: "50%", animationDelay: "1.9s" }} /><span className="au-bubble au-b-lg" style={{ left: "0", top: "44%", animationDelay: "3.3s" }} />
        </div>
      </aside>
    </div>
  );
}
