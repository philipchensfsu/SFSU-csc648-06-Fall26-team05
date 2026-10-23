import { memo } from 'react';
import links from '../links.js';

// FOOTER: deep-teal band
function SiteFooter({ page = 'landing' }) {
  const here = page === 'landing' ? '' : links.home;
  return (
    <footer className="sec-dark" style={{ position: "relative", overflow: "hidden", background: "var(--bg)", color: "var(--text)" }}>
      {/* the deep sea: drifting specks, and an anglerfish whose glowing lure follows the cursor */}
      <div aria-hidden="true">
        <span className="snow" style={{ left: "33.4%", top: "17%", animationDuration: "14.6s", animationDelay: "-1.2s" }} /><span className="snow" style={{ left: "53.4%", top: "34%", animationDuration: "10.4s", animationDelay: "-8.6s" }} />
        <span className="snow hide-xs" style={{ left: "6.5%", top: "39%", animationDuration: "10.5s", animationDelay: "-1.5s" }} />
        <span className="snow" style={{ left: "42.9%", top: "69%", animationDuration: "10.9s", animationDelay: "-3.8s" }} /><span className="snow" style={{ left: "62.0%", top: "78%", animationDuration: "14.0s", animationDelay: "-6.7s" }} />
        <span className="snow hide-xs" style={{ left: "94.8%", top: "10%", animationDuration: "16.0s", animationDelay: "-4.9s" }} />
        <span className="snow" style={{ left: "16.6%", top: "15%", animationDuration: "12.2s", animationDelay: "-13.9s" }} /><span className="snow" style={{ left: "20.0%", top: "50%", animationDuration: "14.5s", animationDelay: "-6.3s" }} />
        <span className="snow hide-xs" style={{ left: "54.5%", top: "11%", animationDuration: "10.4s", animationDelay: "-3.5s" }} />
        <span className="snow" style={{ left: "67.0%", top: "38%", animationDuration: "12.2s", animationDelay: "-10.0s" }} /><span className="snow" style={{ left: "45.6%", top: "29%", animationDuration: "15.6s", animationDelay: "-11.9s" }} />
        <span className="snow hide-xs" style={{ left: "25.9%", top: "50%", animationDuration: "13.7s", animationDelay: "-14.9s" }} />
        <span className="snow" style={{ left: "71.6%", top: "28%", animationDuration: "16.9s", animationDelay: "-2.0s" }} /><span className="snow" style={{ left: "42.3%", top: "64%", animationDuration: "11.1s", animationDelay: "-8.3s" }} />
        <span className="snow hide-xs" style={{ left: "6.7%", top: "57%", animationDuration: "15.4s", animationDelay: "-9.7s" }} />
        <span className="snow" style={{ left: "85.3%", top: "30%", animationDuration: "14.9s", animationDelay: "-10.1s" }} />
      </div>
      <div className="sea sea-zone sea-back" aria-hidden="true" style={{ left: "33%", width: "32%", top: "30px", height: "150px" }}>
        <div className="swim-home" style={{ left: "30%", top: "40px" }}>
          <div className="swim" data-sea="angler">
            <div className="bobY" style={{ animationDuration: "5s" }}>
              <svg viewBox="0 -22 96 84" width="86" height="75">
                <g className="a-lure">
                  <path className="k4" d="M60 12 C62 0 70 -10 80 -11" fill="none" strokeWidth="2" strokeLinecap="round" />
                  <circle className="a-glow a-glow2" cx="81" cy="-11" r="11" />
                  <circle className="a-glow" cx="81" cy="-11" r="7" />
                  <circle className="a-bulb" cx="81" cy="-11" r="3.6" />
                </g>
                <path className="s4" d="M18 34 L3 22 Q8 34 3 46 Z" />
                <path className="s2" d="M16 34 C16 19 31 9 50 10 C66 11 78 20 81 31 L58 36 L80 38 C78 49 68 57 51 58 C31 59 16 50 16 34 Z" />
                <path className="s4" d="M36 12 L40 4 L44 11 Z" />
                <path className="s4 a-fin" d="M42 40 C36 41 31 46 31 51 C36 50 41 46 42 40 Z" />
                <g className="sw">
                  <path d="M64 33.6 L66 37.6 L68 33.2 Z" />
                  <path d="M70 32.6 L72 36.8 L74 32.2 Z" />
                  <path d="M76 31.6 L77.6 35.6 L79.4 31.4 Z" />
                </g>
                <g className="a-jaw">
                  <path className="s2" d="M56 37 C64 39 74 39 82 37 C81 47 72 55 58 55 C57 49 56 43 56 37 Z" />
                  <g className="sw">
                    <path d="M63 38.4 L65 34.4 L67 38.6 Z" />
                    <path d="M69 38.6 L71 34.6 L73 38.6 Z" />
                    <path d="M75 38.2 L77 34.4 L78.8 37.8 Z" />
                  </g>
                </g>
                <circle className="sw" cx="62" cy="22" r="4.6" />
                <circle className="se" cx="63" cy="22.6" r="2.6" />
                <circle className="sw" cx="63.8" cy="21.6" r="0.9" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      {/* two little jellies glowing in the dark at the edges */}
      <div className="sea sea-zone sea-back hide-xs" aria-hidden="true" style={{ left: "1.2%", width: "64px", top: "22px", bottom: "26px" }}>
        <div className="swim-home" style={{ left: "8px", top: "24px" }}>
          <div className="swim" data-sea="jelly">
            <svg className="jellybob" viewBox="0 0 64 100" width="34" height="53.1" style={{ animationDuration: "7s" }}>
              <circle className="s3 jglow" cx="32" cy="24" r="30" />
              <g className="tentacles k1" fill="none" strokeWidth="2.6" strokeLinecap="round">
                <path d="M16 38 q-5 10 0 20 q5 10 0 20" />
                <path d="M27 40 q-4 10 0 20 q4 10 0 20 q-3 6 0 12" />
                <path d="M37 40 q4 10 0 20 q-4 10 0 20 q3 6 0 12" />
                <path d="M48 38 q5 10 0 20 q-5 10 0 20" />
              </g>
              <path className="s1 bell" d="M5 36 C5 15 17 4 32 4 C47 4 59 15 59 36 C54 33 50 38 45.5 35 C41 38 36.5 34 32 37 C27.5 34 23 38 18.5 35 C14 38 10 33 5 36 Z" />
              <ellipse className="s3" cx="19" cy="15" rx="4.2" ry="2.6" transform="rotate(-32 19 15)" />
              <circle className="se" cx="25" cy="23" r="2.4" />
              <circle className="se" cx="39" cy="23" r="2.4" />
              <path className="ke" d="M28.5 28 q3.5 3 7 0" fill="none" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
      <div className="sea sea-zone sea-back hide-xs" aria-hidden="true" style={{ right: "1.2%", width: "64px", top: "22px", bottom: "26px" }}>
        <div className="swim-home" style={{ left: "14px", top: "96px" }}>
          <div className="swim" data-sea="jelly">
            <svg className="jellybob" viewBox="0 0 64 100" width="28" height="43.8" style={{ animationDuration: "8.5s", animationDelay: "-3s" }}>
              <circle className="s3 jglow" cx="32" cy="24" r="30" />
              <g className="tentacles k1" fill="none" strokeWidth="2.6" strokeLinecap="round">
                <path d="M16 38 q-5 10 0 20 q5 10 0 20" />
                <path d="M27 40 q-4 10 0 20 q4 10 0 20 q-3 6 0 12" />
                <path d="M37 40 q4 10 0 20 q-4 10 0 20 q3 6 0 12" />
                <path d="M48 38 q5 10 0 20 q-5 10 0 20" />
              </g>
              <path className="s1 bell" d="M5 36 C5 15 17 4 32 4 C47 4 59 15 59 36 C54 33 50 38 45.5 35 C41 38 36.5 34 32 37 C27.5 34 23 38 18.5 35 C14 38 10 33 5 36 Z" />
              <ellipse className="s3" cx="19" cy="15" rx="4.2" ry="2.6" transform="rotate(-32 19 15)" />
              <circle className="se" cx="25" cy="23" r="2.4" />
              <circle className="se" cx="39" cy="23" r="2.4" />
              <path className="ke" d="M28.5 28 q3.5 3 7 0" fill="none" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ position: "relative", zIndex: "1", maxWidth: "1200px", margin: "0 auto", padding: "56px 24px 36px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "32px", fontSize: "14px", color: "var(--muted)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "320px" }}>
          <div style={{ display: "flex", alignItems: "center", color: "var(--ink)" }}>
            <svg className="logo" width="103.3" height="23" viewBox="68 -792 3610 804" role="img" aria-label="Nautilus">
              <path fill="currentColor" d="M68 -535H194L199 -382L182 -387Q194 -470 240 -508Q286 -547 356 -547Q442 -547 490 -492Q538 -438 538 -344V0H399V-298Q399 -368 379 -402Q360 -436 312 -436Q262 -436 234 -400Q207 -364 207 -298V0H68Z M599 -134Q599 -203 642 -242Q684 -281 774 -299L949 -334Q949 -388 924 -416Q900 -443 852 -443Q808 -443 782 -423Q757 -402 748 -363L608 -370Q623 -456 686 -502Q750 -547 852 -547Q968 -547 1028 -490Q1088 -433 1088 -324V-136Q1088 -114 1095 -106Q1102 -98 1118 -98H1134V0Q1126 2 1112 4Q1098 5 1084 5Q1029 5 998 -22Q967 -50 967 -117L979 -108Q966 -54 914 -21Q862 12 786 12Q701 12 650 -27Q599 -66 599 -134ZM949 -215V-243L819 -216Q780 -208 761 -191Q742 -174 742 -147Q742 -118 762 -102Q780 -86 817 -86Q857 -86 887 -102Q916 -118 933 -147Q949 -176 949 -215Z M1189 -190V-535H1328V-224Q1328 -160 1349 -130Q1370 -100 1413 -100Q1462 -100 1489 -133Q1516 -166 1516 -230V-535H1655V0H1528L1524 -150L1542 -146Q1530 -68 1485 -28Q1440 12 1365 12Q1282 12 1236 -41Q1189 -94 1189 -190Z M1804 -157V-660H1943V-172Q1943 -135 1959 -120Q1974 -106 2009 -106H2084V0H1962Q1880 0 1842 -38Q1804 -76 1804 -157ZM1719 -535H2084V-430H1719Z M2147 -535H2286V0H2147Z M2387 -133 2388 -710H2526V-148Q2526 -126 2537 -116Q2548 -106 2568 -106H2606V0H2522Q2457 0 2422 -32Q2387 -64 2387 -133Z M2665 -190V-535H2804V-224Q2804 -160 2825 -130Q2846 -100 2889 -100Q2938 -100 2965 -133Q2992 -166 2992 -230V-535H3131V0H3004L3000 -150L3018 -146Q3006 -68 2961 -28Q2916 12 2841 12Q2758 12 2712 -41Q2665 -94 2665 -190Z M3191 -168 3332 -174Q3340 -133 3366 -112Q3394 -90 3444 -90Q3488 -90 3512 -104Q3535 -118 3535 -146Q3535 -164 3526 -176Q3518 -188 3493 -196Q3469 -205 3422 -213Q3338 -227 3291 -248Q3244 -268 3224 -299Q3204 -330 3204 -377Q3204 -454 3264 -501Q3324 -547 3436 -547Q3542 -547 3602 -497Q3662 -448 3674 -365L3534 -359Q3528 -400 3502 -422Q3476 -445 3434 -445Q3392 -445 3370 -428Q3348 -410 3348 -382Q3348 -362 3358 -348Q3368 -335 3390 -327Q3412 -318 3452 -312Q3537 -300 3586 -279Q3636 -258 3657 -227Q3678 -196 3678 -149Q3678 -72 3615 -30Q3552 12 3444 12Q3366 12 3310 -11Q3254 -34 3224 -74Q3195 -115 3191 -168Z" />
              <circle className="logo-dot" cx="2216" cy="-702" r="90" style={{ fill: "var(--logo-dot)" }} />
            </svg>
          </div>
          <span>Guided discovery and AI-assisted PRDs.</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "56px" }}>
          <nav aria-label="Product" style={{ display: "flex", flexDirection: "column", gap: "10px" }}><span className="mono" style={{ fontSize: "11px", letterSpacing: ".08em", color: "var(--accent)" }}>PRODUCT</span><a href={here + '#demo'} className="navlink" style={{ color: "var(--muted)", textDecoration: "none" }}>Demo</a><a href={here + '#how'} className="navlink" style={{ color: "var(--muted)", textDecoration: "none" }}>How it works</a></nav>
          <nav aria-label="Team" style={{ display: "flex", flexDirection: "column", gap: "10px" }}><span className="mono" style={{ fontSize: "11px", letterSpacing: ".08em", color: "var(--accent)" }}>TEAM</span><a href={links.about} className="navlink" style={{ color: "var(--muted)", textDecoration: "none" }}>About us</a><a href={links.about + '#meetings'} className="navlink" style={{ color: "var(--muted)", textDecoration: "none" }}>Meetings</a></nav>
          <nav aria-label="Account" style={{ display: "flex", flexDirection: "column", gap: "10px" }}><span className="mono" style={{ fontSize: "11px", letterSpacing: ".08em", color: "var(--accent)" }}>ACCOUNT</span><a href={links.signUp} className="navlink" style={{ color: "var(--muted)", textDecoration: "none" }}>Sign up</a><a href={links.signIn} className="navlink" style={{ color: "var(--muted)", textDecoration: "none" }}>Sign in</a></nav>
          <nav aria-label="Legal" style={{ display: "flex", flexDirection: "column", gap: "10px" }}><span className="mono" style={{ fontSize: "11px", letterSpacing: ".08em", color: "var(--accent)" }}>LEGAL</span><a href={links.privacy} className="navlink" style={{ color: "var(--muted)", textDecoration: "none" }}>Privacy</a><a href={links.terms} className="navlink" style={{ color: "var(--muted)", textDecoration: "none" }}>Terms</a></nav>
        </div>
      </div>
      <div style={{ position: "relative", zIndex: "1", maxWidth: "1200px", margin: "0 auto", padding: "18px 24px 30px", borderTop: "1px solid var(--line)", fontSize: "13px", color: "var(--label)" }}>
        © 2026 Nautilus
        <span className="shell" aria-hidden="true" style={{ right: "24px", top: "15px", rotate: "-12deg" }}>
          <svg viewBox="0 9 48 36" width="22" height="16.5">
            <path className="h1 hk" d="M14 35 L34 35 L31 42.5 L17 42.5 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="h1 hk" d="M20.5 38 L2.4 30.1 Q1 24.7 6.4 23.2 Q6.9 17.6 12.5 18.1 Q14.9 13 20 15.3 Q24 11.4 28 15.3 Q33.1 13 35.5 18.1 Q41.1 17.6 41.6 23.2 Q47 24.7 45.6 30.1 L27.5 38 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="hk" d="M18.6 33.5 L7.5 24.2M20.5 31.9 L13.3 19.4M22.8 31.1 L20.3 16.8M25.2 31.1 L27.7 16.8M27.5 31.9 L34.8 19.4M29.4 33.5 L40.5 24.2" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="shell" aria-hidden="true" style={{ right: "56px", top: "20px" }}>
          <svg viewBox="0 0 44 28" width="18" height="11.5">
            <path className="h1 hk" d="M2 14 C2 7 11 2.5 22 2.5 C33 2.5 42 7 42 14 C42 21 33 25.5 22 25.5 C11 25.5 2 21 2 14 Z" strokeWidth="2" strokeLinejoin="round" />
            <circle className="h3" cx="11" cy="10" r="2.4" />
            <circle className="h3" cx="18" cy="7.5" r="1.8" />
            <circle className="h3" cx="25" cy="8.5" r="2.6" />
            <circle className="h3" cx="32" cy="11" r="1.9" />
            <circle className="h3" cx="16" cy="14" r="1.7" />
            <circle className="h3" cx="23" cy="14.5" r="2" />
            <circle className="h3" cx="30" cy="16" r="1.4" />
            <circle className="h3" cx="8.5" cy="15.5" r="1.4" />
            <path className="hk" d="M7 20.5 C14 24 30 24 37 20.5" fill="none" strokeWidth="1.8" strokeLinecap="round" />
            <path className="hk" d="M11 22 l0 2M15.5 22.6 l0 2M20 22.9 l0 2M24.5 22.8 l0 2M29 22.5 l0 2M33.5 22 l0 2" fill="none" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
      </div>
    </footer>
  );
}

export default memo(SiteFooter);
