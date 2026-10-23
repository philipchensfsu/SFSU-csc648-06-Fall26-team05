import { useRef } from 'react';
import links from '../links.js';
import { followLink } from '../page.js';
import { Message } from './AuthParts.jsx';
import useAuthPage from './useAuthPage.js';
import './auth.css';

// the page root: background, text colour and type for everything inside
const ROOT_STYLE = { position: "relative", overflow: "hidden", minHeight: "100vh", boxSizing: "border-box", background: "#F1F7F8", color: "#102C33", fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: "15px", lineHeight: "1.5", display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 16px 116px", gap: "32px" };

// Sign in. Props (all optional):
//   onSubmit({ email, password, remember })   the form was sent; the browser has already checked both fields are filled in
//   onGoogle()                                 "Continue with Google"
//   onEmailLink(email)                         "Email me a sign-in link" (asks for the email first if the field is empty)
//   onForgotPassword(email)                    "Forgot password?" (same)
//   onNavigate(path)   routes the page's links ("/", "/signin", "/signup") client-side; without it they are plain links
//   error, notice      a message above the main button: error in red, notice (e.g. "Check your inbox") in aqua
//   busy               disables the buttons while a request is out
//   defaultValues      fields start empty unless given here; title: the tab title (null leaves it alone)
export default function SignInPage({ onSubmit, onGoogle, onEmailLink, onForgotPassword, error = '', notice = '', busy = false, onNavigate, defaultValues, title }) {
  useAuthPage(title === undefined ? 'Nautilus — Sign in' : title);
  const emailRef = useRef(null);
  const values = { email: '', password: '', remember: true, ...defaultValues };

  function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    onSubmit?.({ email: String(form.get('email')).trim(), password: String(form.get('password')), remember: form.get('remember') === 'on' });
  }

  // the link and the reset both need an email: if the field isn't valid yet, the browser says so there
  function withEmail(handler) {
    const input = emailRef.current;
    if (input && !input.checkValidity()) {
      input.reportValidity();
      return;
    }
    handler?.(input ? input.value.trim() : '');
  }
  const google = () => onGoogle?.();
  const emailLink = () => withEmail(onEmailLink);
  function forgot(e) {
    e.preventDefault();
    withEmail(onForgotPassword);
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
          <h1 style={{ margin: "0", fontSize: "26px", letterSpacing: "-0.02em", fontWeight: "650" }}>Welcome <span className="au-serif">back</span></h1>
          <p style={{ margin: "0", color: "#557479" }}>Sign in to pick up where you left off.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label htmlFor="si-email" style={{ fontWeight: "500", fontSize: "14px" }}>Email</label>
          <input ref={emailRef} id="si-email" name="email" type="email" required defaultValue={values.email} autoComplete="email" className="au-input" style={{ height: "44px", boxSizing: "border-box", borderRadius: "9px", padding: "0 12px", font: "inherit", color: "#102C33" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <label htmlFor="si-pass" style={{ fontWeight: "500", fontSize: "14px" }}>Password</label>
            <a href="#" onClick={forgot} style={{ fontSize: "13px" }}>Forgot password?</a>
          </div>
          <input id="si-pass" name="password" type="password" required defaultValue={values.password} autoComplete="current-password" className="au-input" style={{ height: "44px", boxSizing: "border-box", borderRadius: "9px", padding: "0 12px", font: "inherit", color: "#102C33" }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#3E5A60", minHeight: "24px" }}>
          <input name="remember" type="checkbox" defaultChecked={values.remember} style={{ width: "18px", height: "18px", accentColor: "#1D6F7A", margin: "0" }} />
          Keep me signed in on this device
        </label>
        <Message error={error} notice={notice} />
        <button type="submit" disabled={busy} className="au-primary" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "48px", borderRadius: "10px", background: "#85D1DB", color: "#102C33", fontWeight: "600" }}>{busy ? "Signing in…" : "Sign in"}</button>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#557479", fontSize: "13px" }}><span style={{ flex: "1", height: "1px", background: "#DCEBEE" }} />or<span style={{ flex: "1", height: "1px", background: "#DCEBEE" }} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button type="button" onClick={google} disabled={busy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", height: "46px", borderRadius: "10px", border: "1px solid #C3DADE", background: "#FFFFFF", color: "#102C33", font: "inherit", fontWeight: "500", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 12h8" />
            </svg>
            Continue with Google
          </button>
          {onEmailLink ? (
            <button type="button" onClick={emailLink} disabled={busy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", height: "46px", borderRadius: "10px", border: "1px solid #C3DADE", background: "#FFFFFF", color: "#102C33", font: "inherit", fontWeight: "500", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              Email me a sign-in link
            </button>
          ) : null}
        </div>
      </form>
      <p style={{ margin: "0", fontSize: "14px", color: "#3E5A60" }}>New to Nautilus? <a href={links.signUp} style={{ fontWeight: "500" }}>Create an account</a></p>
      {/* two gulls over the margins; along the bottom a strip of sea with the fish, and a gull riding the waves */}
      <div className="au-sea au-sea-light au-si-sky au-si-sky-l" aria-hidden="true">
        <div className="au-si-gull au-si-g1">
          <div className="au-g-bob">
            <svg viewBox="0 0 64 44" width="54" height="37.1" aria-hidden="true">
              <g className="au-g-wing au-g-far">
                <path className="au-h3 au-hk" d="M34 23.5 C35 16 38.5 10 45.5 5 C44.8 12 42.3 18 39 23.5 Z" strokeWidth="1.52" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </g>
              <path className="au-h4 au-hk" d="M12.5 26 L4 22.5 L5.6 29.6 Z" strokeWidth="1.6" strokeLinejoin="round" />
              <path className="au-h4 au-hk" d="M10 26.5 C16 22 27 20.5 37 21.5 C41.5 17.5 48.5 17.6 51 22 C52.6 25 50.4 28 46 28.6 C37 32 22 32.2 10 26.5 Z" strokeWidth="1.8" strokeLinejoin="round" />
              <path className="au-s4 au-hk" d="M50.6 22.6 L58.4 24.2 L50.8 25.8 Z" strokeWidth="1.3" strokeLinejoin="round" />
              <circle className="au-se" cx="46.4" cy="22.4" r="1.7" />
              <circle className="au-sw" cx="46.9" cy="21.8" r="0.6" />
              <g className="au-g-wing au-g-near">
                <path className="au-h1 au-hk" d="M31 25 C29 19 26.5 14.5 23 11 C19 7 14 4.5 8 3 C11.5 6.5 14 10 16 14 C17.5 17.5 18.5 21 19 25 Z" strokeWidth="1.52" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                <path className="au-hk2" d="M8 3 C11 3.8 14 5.3 16.6 7.3 L13.4 10.2 C12 7.6 10.4 5.2 8 3 Z" />
              </g>
            </svg>
          </div>
        </div>
      </div>
      <div className="au-sea au-sea-light au-si-sky au-si-sky-r" aria-hidden="true">
        <div className="au-si-gull au-si-g2">
          <div className="au-g-bob">
            <svg viewBox="0 0 64 44" width="44" height="30.2" aria-hidden="true">
              <g className="au-g-wing au-g-far">
                <path className="au-h3 au-hk" d="M34 23.5 C35 16 38.5 10 45.5 5 C44.8 12 42.3 18 39 23.5 Z" strokeWidth="1.24" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </g>
              <path className="au-h4 au-hk" d="M12.5 26 L4 22.5 L5.6 29.6 Z" strokeWidth="1.6" strokeLinejoin="round" />
              <path className="au-h4 au-hk" d="M10 26.5 C16 22 27 20.5 37 21.5 C41.5 17.5 48.5 17.6 51 22 C52.6 25 50.4 28 46 28.6 C37 32 22 32.2 10 26.5 Z" strokeWidth="1.8" strokeLinejoin="round" />
              <path className="au-s4 au-hk" d="M50.6 22.6 L58.4 24.2 L50.8 25.8 Z" strokeWidth="1.3" strokeLinejoin="round" />
              <circle className="au-se" cx="46.4" cy="22.4" r="1.7" />
              <circle className="au-sw" cx="46.9" cy="21.8" r="0.6" />
              <g className="au-g-wing au-g-near">
                <path className="au-h1 au-hk" d="M31 25 C29 19 26.5 14.5 23 11 C19 7 14 4.5 8 3 C11.5 6.5 14 10 16 14 C17.5 17.5 18.5 21 19 25 Z" strokeWidth="1.24" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                <path className="au-hk2" d="M8 3 C11 3.8 14 5.3 16.6 7.3 L13.4 10.2 C12 7.6 10.4 5.2 8 3 Z" />
              </g>
            </svg>
          </div>
        </div>
      </div>
      <div className="au-sea au-sea-aqua au-si-sea" aria-hidden="true">
        <div className="au-surface">
          <svg className="au-wv au-wv-back" viewBox="0 0 4800 44" width="4800" height="44" aria-hidden="true">
            <path className="au-s3" d="M-60 15 Q-5 8 50 15 T160 15 T270 15 T380 15 T490 15 T600 15 T710 15 T820 15 T930 15 T1040 15 T1150 15 T1260 15 T1370 15 T1480 15 T1590 15 T1700 15 T1810 15 T1920 15 T2030 15 T2140 15 T2250 15 T2360 15 T2470 15 T2580 15 T2690 15 T2800 15 T2910 15 T3020 15 T3130 15 T3240 15 T3350 15 T3460 15 T3570 15 T3680 15 T3790 15 T3900 15 T4010 15 T4120 15 T4230 15 T4340 15 T4450 15 T4560 15 T4670 15 T4780 15 T4890 15 T5000 15 T5110 15 L5110 44 L-60 44 Z" />
          </svg>
        </div>
        <div className="au-si-swim">
          <div className="au-bobY">
            <svg viewBox="0 0 48 30" width="30" height="18.8">
              <path className="au-s2 au-tail" d="M3 5 L16 15 L3 25 Q7 15 3 5 Z" />
              <path className="au-s2" d="M22 5 Q28 -1 34 5 Z" />
              <ellipse className="au-s1" cx="28" cy="15" rx="16" ry="10.5" />
              <path className="au-k3" d="M22 6.5 Q18.5 15 22 23.5" fill="none" strokeWidth="2.4" strokeLinecap="round" />
              <circle className="au-sw" cx="36.5" cy="12.5" r="3.4" />
              <circle className="au-se" cx="37.2" cy="12.8" r="2" />
              <path className="au-ke" d="M40.5 18.5 q-2 1.6 -4 .6" fill="none" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div className="au-si-swim2">
          <div className="au-bobY" style={{ animationDelay: "-1.1s" }}>
            <svg viewBox="0 0 48 30" width="34" height="21.2">
              <path className="au-s2 au-tail" d="M3 5 L16 15 L3 25 Q7 15 3 5 Z" />
              <path className="au-s2" d="M22 5 Q28 -1 34 5 Z" />
              <ellipse className="au-s1" cx="28" cy="15" rx="16" ry="10.5" />
              <path className="au-k3" d="M22 6.5 Q18.5 15 22 23.5" fill="none" strokeWidth="2.4" strokeLinecap="round" />
              <circle className="au-sw" cx="36.5" cy="12.5" r="3.4" />
              <circle className="au-se" cx="37.2" cy="12.8" r="2" />
              <path className="au-ke" d="M40.5 18.5 q-2 1.6 -4 .6" fill="none" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div className="au-si-swim3">
          <div className="au-bobY" style={{ animationDelay: "-2.3s" }}>
            <svg viewBox="0 0 48 30" width="26" height="16.2">
              <path className="au-s2 au-tail" d="M3 5 L16 15 L3 25 Q7 15 3 5 Z" />
              <path className="au-s2" d="M22 5 Q28 -1 34 5 Z" />
              <ellipse className="au-s1" cx="28" cy="15" rx="16" ry="10.5" />
              <path className="au-k3" d="M22 6.5 Q18.5 15 22 23.5" fill="none" strokeWidth="2.4" strokeLinecap="round" />
              <circle className="au-sw" cx="36.5" cy="12.5" r="3.4" />
              <circle className="au-se" cx="37.2" cy="12.8" r="2" />
              <path className="au-ke" d="M40.5 18.5 q-2 1.6 -4 .6" fill="none" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
        </div>
        <div className="au-si-float">
          <div className="au-g-ride">
            <svg viewBox="0 0 64 40" width="50" height="31.2" aria-hidden="true">
              <path className="au-h4 au-hk" d="M13 25 L3.5 18.5 L6 27.5 Z" strokeWidth="1.6" strokeLinejoin="round" />
              <path className="au-h4 au-hk" d="M8 27 C9 21.5 17 19 28 19.5 L37 19.5 C37.5 13 41.5 8.5 47 8.5 C52.5 8.5 55.4 12.5 54.2 17 C53.4 20 50.6 21.6 47.6 22 C50.5 24 51 28 48 31 C40 35.5 18 35.5 8 27 Z" strokeWidth="1.8" strokeLinejoin="round" />
              <path className="au-h1 au-hk" d="M15 24.5 C20 20.5 29 19.6 38.5 22.5 C34.5 27.5 25 29 15 24.5 Z" strokeWidth="1.6" strokeLinejoin="round" />
              <path className="au-hk2" d="M15 24.5 C12.5 22.6 10.6 20.6 9.4 18.6 C12.6 19.8 15.4 21.2 18.2 23 Z" />
              <path className="au-s4 au-hk" d="M53.6 13.6 L61 15.4 L53.6 17.2 Z" strokeWidth="1.3" strokeLinejoin="round" />
              <circle className="au-se" cx="48.6" cy="13.4" r="1.8" />
              <circle className="au-sw" cx="49.1" cy="12.8" r="0.65" />
            </svg>
          </div>
        </div>
        <div className="au-surface" style={{ zIndex: "2" }}>
          <svg className="au-wv au-wv-front" viewBox="0 0 4800 44" width="4800" height="44" aria-hidden="true">
            <path className="au-wv-fill" d="M0 20 Q40 15 80 20 T160 20 T240 20 T320 20 T400 20 T480 20 T560 20 T640 20 T720 20 T800 20 T880 20 T960 20 T1040 20 T1120 20 T1200 20 T1280 20 T1360 20 T1440 20 T1520 20 T1600 20 T1680 20 T1760 20 T1840 20 T1920 20 T2000 20 T2080 20 T2160 20 T2240 20 T2320 20 T2400 20 T2480 20 T2560 20 T2640 20 T2720 20 T2800 20 T2880 20 T2960 20 T3040 20 T3120 20 T3200 20 T3280 20 T3360 20 T3440 20 T3520 20 T3600 20 T3680 20 T3760 20 T3840 20 T3920 20 T4000 20 T4080 20 T4160 20 T4240 20 T4320 20 T4400 20 T4480 20 T4560 20 T4640 20 T4720 20 T4800 20 T4880 20 T4960 20 L4960 44 L0 44 Z" />
          </svg>
        </div>
        <div style={{ position: "absolute", left: "2%", bottom: "0" }}>
          <svg viewBox="0 0 76 124" width="56" height="92">
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
        <div style={{ position: "absolute", right: "2.5%", bottom: "0" }}>
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
        <span className="au-sea" style={{ position: "absolute", left: "14%", bottom: "8px", rotate: "-12deg" }}>
          <svg viewBox="0 9 48 36" width="30" height="22.5">
            <path className="au-h1 au-hk" d="M14 35 L34 35 L31 42.5 L17 42.5 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="au-h1 au-hk" d="M20.5 38 L2.4 30.1 Q1 24.7 6.4 23.2 Q6.9 17.6 12.5 18.1 Q14.9 13 20 15.3 Q24 11.4 28 15.3 Q33.1 13 35.5 18.1 Q41.1 17.6 41.6 23.2 Q47 24.7 45.6 30.1 L27.5 38 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="au-hk" d="M18.6 33.5 L7.5 24.2M20.5 31.9 L13.3 19.4M22.8 31.1 L20.3 16.8M25.2 31.1 L27.7 16.8M27.5 31.9 L34.8 19.4M29.4 33.5 L40.5 24.2" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span> <span className="au-sea" style={{ position: "absolute", left: "31%", bottom: "9px" }}>
          <svg viewBox="0 0 44 44" width="26" height="26">
            <path className="au-h1 au-hk" d="M28.8 23 L28.8 22.4 L28.9 21.8 L28.8 21.2 L28.7 20.6 L28.6 19.9 L28.4 19.3 L28.1 18.7 L27.8 18.1 L27.4 17.6 L27 17 L26.5 16.5 L26 16.1 L25.4 15.6 L24.8 15.3 L24.2 14.9 L23.5 14.7 L22.7 14.4 L22 14.3 L21.2 14.2 L20.4 14.2 L19.7 14.2 L18.9 14.4 L18.1 14.5 L17.3 14.8 L16.5 15.1 L15.7 15.5 L15 16 L14.3 16.6 L13.7 17.2 L13.1 17.9 L12.5 18.6 L12.1 19.4 L11.6 20.2 L11.3 21.1 L11 22 L10.8 23 L10.7 24 L10.7 25 L10.7 26 L10.9 27 L11.1 28.1 L11.5 29.1 L11.9 30.1 L12.4 31 L13 32 L13.7 32.9 L14.5 33.7 L15.4 34.5 L16.3 35.2 L17.3 35.8 L18.4 36.3 L19.6 36.8 L20.8 37.1 L22 37.4 L23.3 37.5 L24.6 37.6 L25.9 37.5 L27.2 37.3 L28.5 37 L29.8 36.5 L31.1 36 L32.3 35.3 L33.5 34.5 L34.7 33.6 L35.7 32.6 L36.7 31.5 L37.6 30.3 L38.4 29 L39.1 27.6 L39.7 26.1 L40.2 24.6 L40.5 23 L28.8 23 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="au-hk" d="M32.5 33.8 Q32.1 31.5 31.1 27.8M22.3 36.2 Q23.4 34.6 25.1 31.6M14.3 31.7 Q15.9 31.4 18.8 30.4M11.9 23.9 Q13 24.8 15.4 25.9" fill="none" strokeWidth="2" strokeLinecap="round" />
            <path className="au-hk" d="M24.5 22.2 L24.4 21.9 L24.3 21.7 L24.2 21.4 L24.1 21.2 L23.9 21 L23.8 20.7 L23.5 20.5 L23.3 20.3 L23.1 20.2 L22.8 20 L22.5 19.9 L22.2 19.9 L21.9 19.8 L21.6 19.8 L21.2 19.8 L20.9 19.8 L20.6 19.9 L20.2 20 L19.9 20.2 L19.6 20.3 L19.3 20.6 L19 20.8 L18.8 21.1 L18.5 21.4 L18.3 21.7 L18.2 22.1 L18 22.4 L17.9 22.8 L17.9 23.2 L17.9 23.7 L17.9 24.1 L17.9 24.5 L18 24.9 L18.2 25.4 L18.4 25.8 L18.6 26.2 L18.9 26.5 L19.2 26.9 L19.6 27.2 L20 27.5 L20.4 27.7 L20.9 28 L21.4 28.1 L21.9 28.2 L22.4 28.3 L23 28.3 L23.5 28.3 L24.1 28.2 L24.6 28 L25.1 27.8 L25.7 27.6 L26.2 27.3 L26.6 26.9 L27.1 26.5 L27.5 26 L27.9 25.5 L28.2 24.9 L28.4 24.3 L28.6 23.7 L28.8 23" fill="none" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span> <span className="au-sea" style={{ position: "absolute", right: "22%", bottom: "7px" }}>
          <svg viewBox="0 4 52 38" width="40" height="29.2">
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
        </span> <span className="au-sea" style={{ position: "absolute", right: "12%", bottom: "10px", rotate: "20deg" }}>
          <svg viewBox="0 0 40 40" width="24" height="24">
            <circle className="au-h1 au-hk" cx="20" cy="20" r="17" strokeWidth="2" />
            <ellipse className="au-h3 au-hk" cx="20" cy="12.8" rx="5" ry="2.3" transform="rotate(-90 20 12.8)" strokeWidth="1.4" />
            <ellipse className="au-h3 au-hk" cx="26.8" cy="17.8" rx="5" ry="2.3" transform="rotate(-18 26.8 17.8)" strokeWidth="1.4" />
            <ellipse className="au-h3 au-hk" cx="24.2" cy="25.8" rx="5" ry="2.3" transform="rotate(54 24.2 25.8)" strokeWidth="1.4" />
            <ellipse className="au-h3 au-hk" cx="15.8" cy="25.8" rx="5" ry="2.3" transform="rotate(126 15.8 25.8)" strokeWidth="1.4" />
            <ellipse className="au-h3 au-hk" cx="13.2" cy="17.8" rx="5" ry="2.3" transform="rotate(198 13.2 17.8)" strokeWidth="1.4" />
            <circle className="au-hk2" cx="20" cy="20" r="1.6" />
          </svg>
        </span> <span className="au-bubble" style={{ left: "40%", bottom: "20px", animationDelay: ".5s" }} /><span className="au-bubble au-b-sm" style={{ left: "64%", bottom: "26px", animationDelay: "2.6s" }} /><span className="au-bubble au-b-lg" style={{ left: "82%", bottom: "18px", animationDelay: "4.2s" }} />
      </div>
    </div>
  );
}
