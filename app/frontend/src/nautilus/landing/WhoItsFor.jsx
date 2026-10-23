import { memo } from 'react';

// WHO
function WhoItsFor() {
  return (
    <section id="who" className="whoS" style={{ padding: "40px 24px 128px", borderTop: "1px solid var(--line)" }}>
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "40px", paddingTop: "88px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "16px" }}>
          <h2 className="rv" style={{ margin: "0", fontSize: "clamp(36px, 4.6vw, 56px)", lineHeight: "1.04", letterSpacing: "-0.028em", fontWeight: "650", color: "var(--ink)" }}>Built for whoever <span className="serif hl hl-scroll">writes the spec.</span></h2>
          <span className="mono" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--accent)" }}>WHO IT’S FOR</span>
        </div>
        <ul style={{ margin: "0", padding: "0", listStyle: "none", borderTop: "1px solid var(--line)" }}>
          <li className="wrow" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: "8px 40px", alignItems: "baseline", padding: "30px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="wline" aria-hidden="true" style={{ position: "absolute", left: "0", right: "0", bottom: "-1px", height: "2px", background: "var(--brand)" }} /><span className="wrole" style={{ fontSize: "clamp(30px, 3.4vw, 44px)", fontWeight: "500", letterSpacing: "-0.025em", color: "var(--ink)" }}>Product managers</span>
            <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", color: "var(--text)", fontSize: "17px" }}>
              A reviewable first draft in an afternoon, so your time goes to the decisions.<svg className="farrow" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", stroke: "var(--accent)" }}>
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </span>
          </li>
          <li className="wrow" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: "8px 40px", alignItems: "baseline", padding: "30px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="wline" aria-hidden="true" style={{ position: "absolute", left: "0", right: "0", bottom: "-1px", height: "2px", background: "var(--brand)" }} /><span className="wrole" style={{ fontSize: "clamp(30px, 3.4vw, 44px)", fontWeight: "500", letterSpacing: "-0.025em", color: "var(--ink)" }}>Startup founders</span>
            <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", color: "var(--text)", fontSize: "17px" }}>
              Turn the idea in your head into a plan your first engineers can read.<svg className="farrow" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", stroke: "var(--accent)" }}>
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </span>
          </li>
          <li className="wrow" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: "8px 40px", alignItems: "baseline", padding: "30px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="wline" aria-hidden="true" style={{ position: "absolute", left: "0", right: "0", bottom: "-1px", height: "2px", background: "var(--brand)" }} /><span className="wrole" style={{ fontSize: "clamp(30px, 3.4vw, 44px)", fontWeight: "500", letterSpacing: "-0.025em", color: "var(--ink)" }}>Developers &amp; tech leads</span>
            <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", color: "var(--text)", fontSize: "17px" }}>
              Numbered, testable requirements and explicit constraints, not a wall of prose.<svg className="farrow" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", stroke: "var(--accent)" }}>
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </span>
          </li>
          <li className="wrow" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: "8px 40px", alignItems: "baseline", padding: "30px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="wline" aria-hidden="true" style={{ position: "absolute", left: "0", right: "0", bottom: "-1px", height: "2px", background: "var(--brand)" }} /><span className="wrole" style={{ fontSize: "clamp(30px, 3.4vw, 44px)", fontWeight: "500", letterSpacing: "-0.025em", color: "var(--ink)" }}>Students &amp; junior PMs</span>
            <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", color: "var(--text)", fontSize: "17px" }}>
              Learn what a good PRD contains by answering the questions that produce one.<svg className="farrow" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", stroke: "var(--accent)" }}>
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </span>
          </li>
        </ul>
        {/* shells on the bottom line, and a starfish rolling about between them */}
        <span className="shell" aria-hidden="true" style={{ left: "40%", bottom: "1.2px", rotate: "6deg" }}>
          <svg viewBox="0 9 48 36" width="24" height="18">
            <path className="h1 hk" d="M14 35 L34 35 L31 42.5 L17 42.5 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="h1 hk" d="M20.5 38 L2.4 30.1 Q1 24.7 6.4 23.2 Q6.9 17.6 12.5 18.1 Q14.9 13 20 15.3 Q24 11.4 28 15.3 Q33.1 13 35.5 18.1 Q41.1 17.6 41.6 23.2 Q47 24.7 45.6 30.1 L27.5 38 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="hk" d="M18.6 33.5 L7.5 24.2M20.5 31.9 L13.3 19.4M22.8 31.1 L20.3 16.8M25.2 31.1 L27.7 16.8M27.5 31.9 L34.8 19.4M29.4 33.5 L40.5 24.2" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="shell hide-xs" aria-hidden="true" style={{ left: "70%", bottom: "0px" }}>
          <svg viewBox="0 0 44 44" width="24" height="24">
            <path className="h1 hk" d="M28.8 23 L28.8 22.4 L28.9 21.8 L28.8 21.2 L28.7 20.6 L28.6 19.9 L28.4 19.3 L28.1 18.7 L27.8 18.1 L27.4 17.6 L27 17 L26.5 16.5 L26 16.1 L25.4 15.6 L24.8 15.3 L24.2 14.9 L23.5 14.7 L22.7 14.4 L22 14.3 L21.2 14.2 L20.4 14.2 L19.7 14.2 L18.9 14.4 L18.1 14.5 L17.3 14.8 L16.5 15.1 L15.7 15.5 L15 16 L14.3 16.6 L13.7 17.2 L13.1 17.9 L12.5 18.6 L12.1 19.4 L11.6 20.2 L11.3 21.1 L11 22 L10.8 23 L10.7 24 L10.7 25 L10.7 26 L10.9 27 L11.1 28.1 L11.5 29.1 L11.9 30.1 L12.4 31 L13 32 L13.7 32.9 L14.5 33.7 L15.4 34.5 L16.3 35.2 L17.3 35.8 L18.4 36.3 L19.6 36.8 L20.8 37.1 L22 37.4 L23.3 37.5 L24.6 37.6 L25.9 37.5 L27.2 37.3 L28.5 37 L29.8 36.5 L31.1 36 L32.3 35.3 L33.5 34.5 L34.7 33.6 L35.7 32.6 L36.7 31.5 L37.6 30.3 L38.4 29 L39.1 27.6 L39.7 26.1 L40.2 24.6 L40.5 23 L28.8 23 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="hk" d="M32.5 33.8 Q32.1 31.5 31.1 27.8M22.3 36.2 Q23.4 34.6 25.1 31.6M14.3 31.7 Q15.9 31.4 18.8 30.4M11.9 23.9 Q13 24.8 15.4 25.9" fill="none" strokeWidth="2" strokeLinecap="round" />
            <path className="hk" d="M24.5 22.2 L24.4 21.9 L24.3 21.7 L24.2 21.4 L24.1 21.2 L23.9 21 L23.8 20.7 L23.5 20.5 L23.3 20.3 L23.1 20.2 L22.8 20 L22.5 19.9 L22.2 19.9 L21.9 19.8 L21.6 19.8 L21.2 19.8 L20.9 19.8 L20.6 19.9 L20.2 20 L19.9 20.2 L19.6 20.3 L19.3 20.6 L19 20.8 L18.8 21.1 L18.5 21.4 L18.3 21.7 L18.2 22.1 L18 22.4 L17.9 22.8 L17.9 23.2 L17.9 23.7 L17.9 24.1 L17.9 24.5 L18 24.9 L18.2 25.4 L18.4 25.8 L18.6 26.2 L18.9 26.5 L19.2 26.9 L19.6 27.2 L20 27.5 L20.4 27.7 L20.9 28 L21.4 28.1 L21.9 28.2 L22.4 28.3 L23 28.3 L23.5 28.3 L24.1 28.2 L24.6 28 L25.1 27.8 L25.7 27.6 L26.2 27.3 L26.6 26.9 L27.1 26.5 L27.5 26 L27.9 25.5 L28.2 24.9 L28.4 24.3 L28.6 23.7 L28.8 23" fill="none" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        {/* a moray in its den on the floor line: it peeks out now and then, and ducks if you come close */}
        <div className="sea sea-zone sea-front" aria-hidden="true" style={{ right: "10%", width: "78px", bottom: "1px", height: "69px" }}>
          <div className="swim-home" style={{ left: "0", top: "0" }}>
            <div className="swim" data-sea="eel">
              <svg viewBox="0 0 84 74" width="78" height="68.7">
                <defs>
                  <clipPath id="eelclip1">
                    <rect x="0" y="-40" width="84" height="93" />
                  </clipPath>
                </defs>
                <g clipPath="url(#eelclip1)">
                  <g className="eel-b">
                    <path className="s1" d="M34 56 C33 44 31 34 33 25 C35 15 41 9 49 9 C57 9 61 15 60 21 C59 26 53 28 49 29 C45 31 44 38 46 56 Z" />
                    <path className="k3" d="M38 21 C40 15 45 12.5 49 12.5" fill="none" strokeWidth="2" strokeLinecap="round" />
                    <circle className="s3" cx="38" cy="38" r="2" />
                    <circle className="s3" cx="41" cy="46" r="1.6" />
                    <circle className="s3" cx="36" cy="30" r="1.5" />
                    <path className="s2" d="M33 27 C30 34 30 44 31 56 L34 56 C33 46 33 36 35 28 Z" />
                    <circle className="sw" cx="51" cy="16" r="3.8" />
                    <circle className="se" cx="51.9" cy="16.3" r="2.2" />
                    <path className="ke" d="M52 24 q4 -.6 7 -3" fill="none" strokeWidth="1.7" strokeLinecap="round" />
                    <g className="k3" fill="none" strokeWidth="1.3">
                      <circle className="eel-bub" cx="62" cy="20" r="2" />
                      <circle className="eel-bub" cx="63" cy="18" r="1.4" />
                    </g>
                  </g>
                </g>
                <path className="s4" d="M4 74 C4 62 14 52 28 50 C34 49 50 49 56 50 C70 52 80 62 80 74 Z" />
                <ellipse className="s2" cx="40" cy="53.5" rx="12.5" ry="4" />
                <path className="k3" d="M13 64 C16 59 21 56 26 55" fill="none" strokeWidth="2" strokeLinecap="round" />
                <circle className="s3" cx="66" cy="62" r="2.4" />
                <circle className="s3" cx="18" cy="66" r="1.8" />
                <circle className="s3" cx="58" cy="68" r="1.5" />
              </svg>
            </div>
          </div>
        </div>
        <div className="sea sea-zone sea-front" aria-hidden="true" style={{ left: "0", right: "0", bottom: "1px", height: "38px" }}>
          <div className="swim-home" style={{ left: "8%", top: "0" }}>
            <div className="swim" data-sea="star">
              <svg viewBox="0 0 60 60" width="38" height="38">
                <path className="s1 k1" d="M30 6 L37.05 22.29 L54.73 23.97 L41.41 35.71 L45.28 53.03 L30 44 L14.72 53.03 L18.59 35.71 L5.27 23.97 L22.95 22.29 Z" strokeWidth="6" strokeLinejoin="round" />
                <g className="s2">
                  <circle cx="30" cy="14" r="1.6" />
                  <circle cx="46" cy="25.5" r="1.6" />
                  <circle cx="40" cy="45" r="1.6" />
                  <circle cx="20" cy="45" r="1.6" />
                  <circle cx="14" cy="25.5" r="1.6" />
                </g>
                <circle className="se" cx="26" cy="30" r="2" />
                <circle className="se" cx="34" cy="30" r="2" />
                <path className="ke" d="M27 35 q3 2.6 6 0" fill="none" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(WhoItsFor);
