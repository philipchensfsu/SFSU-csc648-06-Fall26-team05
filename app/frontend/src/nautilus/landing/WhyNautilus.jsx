import { memo } from 'react';

// WHY NAUTILUS: next to a chat prompt
function WhyNautilus() {
  return (
    <section className="vs" aria-labelledby="vs-h" style={{ position: "relative", padding: "150px 24px 130px" }}>
      {/* two jellyfish drifting up and down the margins */}
      <div className="sea sea-zone sea-back" aria-hidden="true" style={{ right: "0", width: "15%", top: "40px", bottom: "40px" }}>
        <div className="swim-home" style={{ left: "40%", top: "3%" }}>
          <div className="swim" data-sea="jelly">
            <svg className="jellybob" viewBox="0 0 64 100" width="58" height="90">
              <g className="tentacles k2" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M14 38 q-5 10 0 20 q5 10 0 20 q-4 8 0 14" />
                <path d="M25 40 q-4 10 0 20 q4 10 0 20" />
                <path d="M39 40 q4 10 0 20 q-4 10 0 20" />
                <path d="M50 38 q5 10 0 20 q-5 10 0 20 q4 8 0 14" />
              </g>
              <path className="s1 bell" d="M5 36 C5 15 17 4 32 4 C47 4 59 15 59 36 C54 33 50 38 45.5 35 C41 38 36.5 34 32 37 C27.5 34 23 38 18.5 35 C14 38 10 33 5 36 Z" />
              <ellipse className="s3" cx="19" cy="15" rx="4.2" ry="2.6" transform="rotate(-32 19 15)" />
              <circle className="s3" cx="46" cy="15" r="2.2" />
              <circle className="se" cx="25" cy="23" r="2.4" />
              <circle className="se" cx="39" cy="23" r="2.4" />
              <path className="ke" d="M28.5 28 q3.5 3 7 0" fill="none" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
      <div className="sea sea-zone sea-back" aria-hidden="true" style={{ left: "0", width: "15%", top: "40px", bottom: "40px" }}>
        <div className="swim-home" style={{ left: "20%", top: "60%" }}>
          <div className="swim" data-sea="jelly">
            <svg className="jellybob" viewBox="0 0 64 100" width="40" height="62" style={{ animationDelay: "-2.5s" }}>
              <g className="tentacles k2" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M14 38 q-5 10 0 20 q5 10 0 20 q-4 8 0 14" />
                <path d="M25 40 q-4 10 0 20 q4 10 0 20" />
                <path d="M39 40 q4 10 0 20 q-4 10 0 20" />
                <path d="M50 38 q5 10 0 20 q-5 10 0 20 q4 8 0 14" />
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
      {/* a school of sardines that swims as one, and scatters from the cursor */}
      <div className="sea sea-zone" aria-hidden="true" style={{ left: "17%", right: "17%", top: "24px", height: "116px" }}>
        <div className="swim-home" style={{ left: "calc(46% + 0px)", top: "46px" }}>
          <div className="swim" data-sea="school" data-group="vs" data-ox="0" data-oy="0">
            <svg viewBox="0 0 40 16" width="30" height="12">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 32px)", top: "32px" }}>
          <div className="swim" data-sea="school" data-group="vs" data-ox="-32" data-oy="-14">
            <svg viewBox="0 0 40 16" width="25" height="10">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 30px)", top: "61px" }}>
          <div className="swim" data-sea="school" data-group="vs" data-ox="-30" data-oy="15">
            <svg viewBox="0 0 40 16" width="27" height="10.8">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s1" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 64px)", top: "43px" }}>
          <div className="swim" data-sea="school" data-group="vs" data-ox="-64" data-oy="-3">
            <svg viewBox="0 0 40 16" width="22" height="8.8">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 62px)", top: "68px" }}>
          <div className="swim" data-sea="school" data-group="vs" data-ox="-62" data-oy="22">
            <svg viewBox="0 0 40 16" width="25" height="10">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s1" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 94px)", top: "54px" }}>
          <div className="swim" data-sea="school" data-group="vs" data-ox="-94" data-oy="8">
            <svg viewBox="0 0 40 16" width="20" height="8">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% + 22px)", top: "34px" }}>
          <div className="swim" data-sea="school" data-group="vs" data-ox="22" data-oy="-12">
            <svg viewBox="0 0 40 16" width="22" height="8.8">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s2" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ position: "relative", zIndex: "1", maxWidth: "1100px", margin: "0 auto" }}>
        <div className="mono" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--accent)", marginBottom: "28px" }}>WHY NAUTILUS</div>
        <h2 id="vs-h" className="rv" style={{ margin: "0", maxWidth: "980px", fontSize: "clamp(36px, 4.8vw, 64px)", lineHeight: "1.06", letterSpacing: "-0.028em", fontWeight: "650", color: "var(--ink)", textWrap: "balance" }}>A chatbot answers what you ask. <span className="serif hl hl-scroll">Nautilus asks what you missed.</span></h2>
        <p style={{ margin: "28px 0 0", maxWidth: "580px", fontSize: "18px", color: "var(--text)", textWrap: "pretty" }}>A prompt gets you a wall of text. A PRD needs decisions, structure and a trail back to why — so Nautilus interviews you first, then writes the document.</p>
        <div className="vs-table" role="table" aria-label="A chat prompt compared with Nautilus">
          <div className="vs-row vs-head" role="row">
            <span className="vs-k" role="columnheader"><span className="sr">Topic</span></span>
            <span className="vs-a" role="columnheader">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 5.5h16v10.5H10l-6 4.5z" />
              </svg>A chat prompt
            </span>
            <span className="vs-b" role="columnheader">
              <svg className="logo" width="67.4" height="15" viewBox="68 -792 3610 804" role="img" aria-label="Nautilus">
                <path fill="currentColor" d="M68 -535H194L199 -382L182 -387Q194 -470 240 -508Q286 -547 356 -547Q442 -547 490 -492Q538 -438 538 -344V0H399V-298Q399 -368 379 -402Q360 -436 312 -436Q262 -436 234 -400Q207 -364 207 -298V0H68Z M599 -134Q599 -203 642 -242Q684 -281 774 -299L949 -334Q949 -388 924 -416Q900 -443 852 -443Q808 -443 782 -423Q757 -402 748 -363L608 -370Q623 -456 686 -502Q750 -547 852 -547Q968 -547 1028 -490Q1088 -433 1088 -324V-136Q1088 -114 1095 -106Q1102 -98 1118 -98H1134V0Q1126 2 1112 4Q1098 5 1084 5Q1029 5 998 -22Q967 -50 967 -117L979 -108Q966 -54 914 -21Q862 12 786 12Q701 12 650 -27Q599 -66 599 -134ZM949 -215V-243L819 -216Q780 -208 761 -191Q742 -174 742 -147Q742 -118 762 -102Q780 -86 817 -86Q857 -86 887 -102Q916 -118 933 -147Q949 -176 949 -215Z M1189 -190V-535H1328V-224Q1328 -160 1349 -130Q1370 -100 1413 -100Q1462 -100 1489 -133Q1516 -166 1516 -230V-535H1655V0H1528L1524 -150L1542 -146Q1530 -68 1485 -28Q1440 12 1365 12Q1282 12 1236 -41Q1189 -94 1189 -190Z M1804 -157V-660H1943V-172Q1943 -135 1959 -120Q1974 -106 2009 -106H2084V0H1962Q1880 0 1842 -38Q1804 -76 1804 -157ZM1719 -535H2084V-430H1719Z M2147 -535H2286V0H2147Z M2387 -133 2388 -710H2526V-148Q2526 -126 2537 -116Q2548 -106 2568 -106H2606V0H2522Q2457 0 2422 -32Q2387 -64 2387 -133Z M2665 -190V-535H2804V-224Q2804 -160 2825 -130Q2846 -100 2889 -100Q2938 -100 2965 -133Q2992 -166 2992 -230V-535H3131V0H3004L3000 -150L3018 -146Q3006 -68 2961 -28Q2916 12 2841 12Q2758 12 2712 -41Q2665 -94 2665 -190Z M3191 -168 3332 -174Q3340 -133 3366 -112Q3394 -90 3444 -90Q3488 -90 3512 -104Q3535 -118 3535 -146Q3535 -164 3526 -176Q3518 -188 3493 -196Q3469 -205 3422 -213Q3338 -227 3291 -248Q3244 -268 3224 -299Q3204 -330 3204 -377Q3204 -454 3264 -501Q3324 -547 3436 -547Q3542 -547 3602 -497Q3662 -448 3674 -365L3534 -359Q3528 -400 3502 -422Q3476 -445 3434 -445Q3392 -445 3370 -428Q3348 -410 3348 -382Q3348 -362 3358 -348Q3368 -335 3390 -327Q3412 -318 3452 -312Q3537 -300 3586 -279Q3636 -258 3657 -227Q3678 -196 3678 -149Q3678 -72 3615 -30Q3552 12 3444 12Q3366 12 3310 -11Q3254 -34 3224 -74Q3195 -115 3191 -168Z" />
                <circle className="logo-dot" cx="2216" cy="-702" r="90" style={{ fill: "var(--logo-dot)" }} />
              </svg>
            </span>
          </div>
          <div className="vs-row" role="row">
            <span className="vs-k mono" role="rowheader">STARTING POINT</span>
            <span className="vs-a" role="cell">
              <span className="vs-tag">Chat prompt</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.8 9h6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg><span>A blank box. You have to know what to ask.</span>
            </span>
            <span className="vs-b" role="cell">
              <span className="vs-tag">Nautilus</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="9" style={{ fill: "var(--brand)" }} />
                <path d="m5.3 9.3 2.5 2.5 4.9-5.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--btn-ink)" }} />
              </svg><span>Seven guided questions, with follow-ups when an answer is vague.</span>
            </span>
            <span className="vs-line" aria-hidden="true" />
          </div>
          <div className="vs-row" role="row">
            <span className="vs-k mono" role="rowheader">THE DOCUMENT</span>
            <span className="vs-a" role="cell">
              <span className="vs-tag">Chat prompt</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.8 9h6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg><span>One long reply, shaped differently every time.</span>
            </span>
            <span className="vs-b" role="cell">
              <span className="vs-tag">Nautilus</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="9" style={{ fill: "var(--brand)" }} />
                <path d="m5.3 9.3 2.5 2.5 4.9-5.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--btn-ink)" }} />
              </svg><span>The same 9 sections every time, ready for review.</span>
            </span>
            <span className="vs-line" aria-hidden="true" />
          </div>
          <div className="vs-row" role="row">
            <span className="vs-k mono" role="rowheader">MISSING DETAILS</span>
            <span className="vs-a" role="cell">
              <span className="vs-tag">Chat prompt</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.8 9h6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg><span>Quietly filled in with confident guesses.</span>
            </span>
            <span className="vs-b" role="cell">
              <span className="vs-tag">Nautilus</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="9" style={{ fill: "var(--brand)" }} />
                <path d="m5.3 9.3 2.5 2.5 4.9-5.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--btn-ink)" }} />
              </svg><span>Flagged as assumptions for you to confirm.</span>
            </span>
            <span className="vs-line" aria-hidden="true" />
          </div>
          <div className="vs-row" role="row">
            <span className="vs-k mono" role="rowheader">REQUIREMENTS</span>
            <span className="vs-a" role="cell">
              <span className="vs-tag">Chat prompt</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.8 9h6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg><span>Paragraphs your engineers have to interpret.</span>
            </span>
            <span className="vs-b" role="cell">
              <span className="vs-tag">Nautilus</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="9" style={{ fill: "var(--brand)" }} />
                <path d="m5.3 9.3 2.5 2.5 4.9-5.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--btn-ink)" }} />
              </svg><span>Numbered and testable: FR-04, US-03.</span>
            </span>
            <span className="vs-line" aria-hidden="true" />
          </div>
          <div className="vs-row" role="row">
            <span className="vs-k mono" role="rowheader">CHANGING ONE PART</span>
            <span className="vs-a" role="cell">
              <span className="vs-tag">Chat prompt</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.8 9h6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg><span>Ask again and the whole answer shifts.</span>
            </span>
            <span className="vs-b" role="cell">
              <span className="vs-tag">Nautilus</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="9" style={{ fill: "var(--brand)" }} />
                <path d="m5.3 9.3 2.5 2.5 4.9-5.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--btn-ink)" }} />
              </svg><span>Regenerate one section and review it before it replaces yours.</span>
            </span>
            <span className="vs-line" aria-hidden="true" />
          </div>
          <div className="vs-row" role="row">
            <span className="vs-k mono" role="rowheader">SIGN-OFF</span>
            <span className="vs-a" role="cell">
              <span className="vs-tag">Chat prompt</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.8 9h6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg><span>Pasted into a doc, then chased for approval in chat threads.</span>
            </span>
            <span className="vs-b" role="cell">
              <span className="vs-tag">Nautilus</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="9" style={{ fill: "var(--brand)" }} />
                <path d="m5.3 9.3 2.5 2.5 4.9-5.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--btn-ink)" }} />
              </svg><span>Each department approves a specific version. Edit it later and it goes back for sign-off.</span>
            </span>
            <span className="vs-line" aria-hidden="true" />
          </div>
          <div className="vs-row" role="row">
            <span className="vs-k mono" role="rowheader">A WEEK LATER</span>
            <span className="vs-a" role="cell">
              <span className="vs-tag">Chat prompt</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.8 9h6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg><span>Somewhere in your chat history.</span>
            </span>
            <span className="vs-b" role="cell">
              <span className="vs-tag">Nautilus</span>
              <svg className="vs-mark" viewBox="0 0 18 18" aria-hidden="true">
                <circle cx="9" cy="9" r="9" style={{ fill: "var(--brand)" }} />
                <path d="m5.3 9.3 2.5 2.5 4.9-5.2" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--btn-ink)" }} />
              </svg><span>A saved, versioned PRD you can search from your dashboard.</span>
            </span>
            <span className="vs-line" aria-hidden="true" />
          </div>
          <span className="shell" aria-hidden="true" style={{ left: "1%", bottom: "0", rotate: "16deg" }}>
            <svg viewBox="0 0 40 40" width="26" height="26">
              <circle className="h1 hk" cx="20" cy="20" r="17" strokeWidth="2" />
              <ellipse className="h3 hk" cx="20" cy="12.8" rx="5" ry="2.3" transform="rotate(-90 20 12.8)" strokeWidth="1.4" />
              <ellipse className="h3 hk" cx="26.8" cy="17.8" rx="5" ry="2.3" transform="rotate(-18 26.8 17.8)" strokeWidth="1.4" />
              <ellipse className="h3 hk" cx="24.2" cy="25.8" rx="5" ry="2.3" transform="rotate(54 24.2 25.8)" strokeWidth="1.4" />
              <ellipse className="h3 hk" cx="15.8" cy="25.8" rx="5" ry="2.3" transform="rotate(126 15.8 25.8)" strokeWidth="1.4" />
              <ellipse className="h3 hk" cx="13.2" cy="17.8" rx="5" ry="2.3" transform="rotate(198 13.2 17.8)" strokeWidth="1.4" />
              <circle className="hk2" cx="20" cy="20" r="1.6" />
            </svg>
          </span>
        </div>
      </div>
    </section>
  );
}

export default memo(WhyNautilus);
