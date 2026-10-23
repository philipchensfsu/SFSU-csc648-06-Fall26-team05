import { memo } from 'react';

// COMMUNICATION
function Communication() {
  return (
    <section id="communication" style={{ position: "relative", padding: "112px 24px 120px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "40px" }}>
        <div className="rv" style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "720px" }}>
          <div className="mono" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--accent)" }}>COMMUNICATION</div>
          <h2 style={{ margin: "0", fontSize: "clamp(36px, 4.6vw, 56px)", lineHeight: "1.04", letterSpacing: "-0.028em", fontWeight: "650", color: "var(--ink)" }}>How we <span className="serif hl hl-scroll">stay in sync</span>.</h2>
        </div>
        <div style={{ position: "relative" }}>
          <ul className="ab-comm">
            <li className="rv">
              <article className="ab-comm-card">
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <span className="ab-ic">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
                      <path d="M8 10.5h8" />
                      <path d="M8 13.5h5" />
                    </svg>
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <h3 style={{ margin: "0", fontSize: "22px", lineHeight: "1.15", letterSpacing: "-0.012em", fontWeight: "600", color: "var(--ink)" }}>Discord</h3>
                    <span><span className="ab-role">Primary channel</span></span>
                  </div>
                </div>
                <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "var(--text)" }}>Discord is our primary communication channel. All project discussions, standup updates, and questions are posted in our team Discord server.</p>
              </article>
            </li>
            <li className="rv">
              <article className="ab-comm-card">
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <span className="ab-ic">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="6" cy="5.5" r="2.2" />
                      <circle cx="6" cy="18.5" r="2.2" />
                      <circle cx="18" cy="18.5" r="2.2" />
                      <path d="M6 7.7v8.6" />
                      <path d="M18 16.3V10a3 3 0 0 0-3-3h-4" />
                      <path d="M13 4.5 10.5 7 13 9.5" />
                    </svg>
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <h3 style={{ margin: "0", fontSize: "22px", lineHeight: "1.15", letterSpacing: "-0.012em", fontWeight: "600", color: "var(--ink)" }}>GitHub pull requests</h3>
                    <span><span className="ab-role">Code review</span></span>
                  </div>
                </div>
                <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "var(--text)" }}>Code review conversations stay on GitHub pull requests so decisions are documented alongside the code.</p>
              </article>
            </li>
          </ul>
        </div>
        {/* the floor line, with a hermit crab out for a walk */}
        <div aria-hidden="true" style={{ position: "relative", height: "1px", background: "var(--line)", marginTop: "24px" }}>
          <div className="sea sea-zone sea-front" style={{ left: "0", right: "0", bottom: "0", height: "31px" }}>
            <div className="swim-home" style={{ left: "22%", top: "0" }}>
              <div className="swim" data-sea="hermit">
                <div className="scuttle" style={{ animationDuration: ".4s" }}>
                  <svg viewBox="0 0 60 40" width="46" height="30.7">
                    <g className="hc-out">
                      <g className="k2" strokeWidth="2.4" strokeLinecap="round" fill="none">
                        <path d="M38 31 L44 38" />
                        <path d="M41 29 L49 35" />
                        <path d="M35 32 L38 39" />
                        <path d="M42 21 L45 12" />
                        <path d="M45 23 L50 15" />
                      </g>
                      <path className="s2" d="M46 25 C52 20 59 23 58 29 L53 28 L55 32 C50 35 45 32 45 28 Z" />
                      <circle className="sw" cx="45" cy="10.5" r="3.4" />
                      <circle className="se" cx="45.8" cy="10.8" r="1.9" />
                      <circle className="sw" cx="51" cy="13.5" r="3.1" />
                      <circle className="se" cx="51.8" cy="13.8" r="1.7" />
                    </g>
                    <path className="h1 hk" d="M40 34 C40 20 32 9 21 9 C12 9 4 15 2 23 C7 21 11 23 12 27 C16 34 28 37 40 34 Z" strokeWidth="2" strokeLinejoin="round" />
                    <path className="hk" d="M3 22 C9 19 15 20 19 25 M9 14 C15 12.5 22 15 26 21 M19 10.5 C26 11 31.5 16 33.5 23" fill="none" strokeWidth="1.6" strokeLinecap="round" />
                    <path className="h3 hk" d="M40 34 C41 27 39 21 35 18 C37 24 37 30 33 35 Z" strokeWidth="1.6" strokeLinejoin="round" />
                    <circle className="h3" cx="16" cy="18" r="1.5" />
                    <circle className="h3" cx="25" cy="28" r="1.4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(Communication);
