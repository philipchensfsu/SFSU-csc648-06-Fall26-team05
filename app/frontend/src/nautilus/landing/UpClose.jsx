import { memo } from 'react';

// UP CLOSE
function UpClose() {
  return (
    <section className="uc" aria-labelledby="close-h" style={{ position: "relative", padding: "200px 24px 120px" }}>
      {/* the octopus, jetting about in the open water above the close-up (it inks if you startle it) */}
      <div className="sea sea-zone" aria-hidden="true" style={{ left: "8%", right: "16%", top: "36px", height: "156px" }}>
        <span className="ink" />
        <div className="swim-home" style={{ left: "12%", top: "34px" }}>
          <div className="swim" data-sea="octo">
            <svg className="bobY" viewBox="0 0 84 84" width="80" height="80" style={{ animationDuration: "4s" }}>
              <g className="k1" fill="none" strokeWidth="7.5" strokeLinecap="round">
                <path d="M22 44 q-6 14 -16 16" />
                <path d="M31 47 q-3 16 -10 26" />
                <path d="M42 48 q0 16 0 28" />
                <path d="M53 47 q3 16 10 26" />
                <path className="wave" d="M62 44 q6 14 16 16" />
              </g>
              <path className="s1" d="M16 44 C16 20 28 6 42 6 C56 6 68 20 68 44 C68 50 60 52 42 52 C24 52 16 50 16 44 Z" />
              <circle className="s3" cx="30" cy="18" r="3.2" />
              <circle className="s3" cx="54" cy="15" r="2.4" />
              <circle className="s3" cx="60" cy="26" r="2" />
              <circle className="sw" cx="33" cy="33" r="4.6" />
              <circle className="se" cx="34" cy="33.6" r="2.6" />
              <circle className="sw" cx="51" cy="33" r="4.6" />
              <circle className="se" cx="52" cy="33.6" r="2.6" />
              <path className="ke" d="M37 41 q5 4 10 0" fill="none" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
      {/* a seahorse drifting along the right-hand margin */}
      <div className="sea sea-zone sea-back" aria-hidden="true" style={{ right: ".5%", width: "9%", top: "40px", bottom: "40px" }}>
        <div className="swim-home" style={{ left: "30%", top: "6%" }}>
          <div className="swim" data-sea="seahorse">
            <div className="seahorse">
              <svg viewBox="0 0 56 100" width="48" height="86">
                <path className="s2" d="M37 36 Q48 41 39 50 Z" />
                <path className="s2" d="M25 8 L28 1 L31 8 Z" />
                <path className="s2" d="M31 9 L36 4 L36 11 Z" />
                <path className="k1" d="M31 58 C34 70 30 82 21 82 C14 82 13 74 18 72 C21 71 24 74 22 76" fill="none" strokeWidth="7" strokeLinecap="round" />
                <ellipse className="s1" cx="28" cy="44" rx="11.5" ry="16" />
                <path className="s1" d="M20 22 Q16 32 19 36 L36 33 Q38 25 35 19 Z" />
                <circle className="s1" cx="29" cy="17" r="10" />
                <path className="s1" d="M21 15 L9 16 Q6 16.6 6 19 Q6 21.4 9 22 L21 21 Z" />
                <g className="k3" fill="none" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 38 h12" />
                  <path d="M20 44 h15" />
                  <path d="M21 50 h12" />
                </g>
                <circle className="sw" cx="27" cy="14.5" r="3.4" />
                <circle className="se" cx="26.4" cy="14.8" r="2" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <span className="shell hide-xs" aria-hidden="true" style={{ left: "3%", bottom: "54.1px", rotate: "24deg" }}>
        <svg viewBox="0 0 26 51" width="18" height="35.3">
          <path className="h1 hk" d="M13 2 C14.5 4 24 32 24 38 C24 45 19 49 13 49 C7 49 2 45 2 38 C2 32 11.5 4 13 2 Z" strokeWidth="2" strokeLinejoin="round" />
          <path className="hk" d="M11.1 11.7 Q13 12.9 14.9 7.9M9.4 17.2 Q13 18.4 16.6 13.4M7.8 22.7 Q13 23.9 18.2 18.9M6.1 28.1 Q13 29.3 19.9 24.3M4.4 33.6 Q13 34.8 21.6 29.8" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          <path className="h3 hk" d="M7 41 C7 37 12 36 14 39 C16 42 13 46 9.5 45.5 C8 45.2 7 43.5 7 41 Z" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </span>
      <div style={{ position: "relative", zIndex: "1", maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "56px" }}>
        <div className="mono" id="close-h" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--accent)" }}>UP CLOSE</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "56px 0" }}>
          <div className="ucl" style={{ flex: "1 1 480px", minWidth: "0", paddingRight: "56px", display: "flex", flexDirection: "column", gap: "22px" }}>
            <span className="mono" style={{ fontSize: "12px", color: "var(--label)" }}>§6 · REQUIREMENTS · FR-07</span><p className="serif uc-ask" style={{ margin: "0" }}>
              “Make it measurable.”<svg className="uc-hand uc-curl" viewBox="0 0 64 52" width="56" height="46" aria-hidden="true">
                <path pathLength="1" d="M58 5 C44 6 27 13 19 27 C15 34 13 39 12 45" />
                <path pathLength="1" d="M5 36 L12 46 L20 38" />
              </svg>
            </p>
            <div className="uc-doc" style={{ display: "flex", flexDirection: "column", gap: "16px", fontSize: "clamp(28px, 3vw, 40px)", lineHeight: "1.18", letterSpacing: "-0.02em", fontWeight: "500" }}>
              <span>
                <span className="uc-old">
                  Pages should load quickly.<svg className="uc-hand uc-strike" viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
                    <path pathLength="1" d="M2 13 C58 8 116 17 176 12 C222 8 262 10 298 14" />
                    <path pathLength="1" d="M14 18 C80 13 150 20 214 15 C246 13 272 14 290 17" />
                  </svg>
                </span>
              </span><span className="uc-new">
                Group search returns results in under <span className="uc-ringed">
                  1.5 s<svg className="uc-hand uc-ring" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true">
                    <path pathLength="1" d="M14 31 C9 15 38 5 64 6 C90 7 99 22 91 35 C82 47 38 50 17 41 C6 36 9 25 24 15" />
                  </svg>
                </span> at the 95th percentile.
              </span>
            </div>
            <p style={{ margin: "0", color: "var(--text)", maxWidth: "420px" }}>Only that section changes. You review the proposal before anything is replaced.</p>
          </div>
          <div className="ucr" style={{ flex: "1 1 480px", minWidth: "0", paddingLeft: "56px", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: "18px" }}>
            <span className="mono" style={{ fontSize: "12px", color: "var(--label)" }}>INTERVIEW · TARGET USERS → §6</span>
            <p className="serif uc-q" style={{ margin: "0", fontSize: "clamp(28px, 3vw, 40px)", lineHeight: "1.15", color: "var(--ink)" }}>“Commuters can only meet evenings or online.”</p>
            <svg className="uc-arrow uc-hand uc-wave" viewBox="0 0 40 96" width="40" height="96" aria-hidden="true" style={{ marginLeft: "-4px" }}>
              <path pathLength="1" d="M20 4 C31 21 8 35 19 53 C27 65 17 75 20 88" />
              <path pathLength="1" d="M11 79 L20 90 L29 80" />
            </svg>
            <div className="uc-fr" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span className="mono" style={{ fontSize: "14px", color: "var(--accent)" }}>FR-04 · MUST</span>
              <p style={{ margin: "0", fontSize: "clamp(22px, 2.2vw, 28px)", lineHeight: "1.25", letterSpacing: "-0.012em", color: "var(--ink)" }}>
                Users filter open groups by <span className="uc-ul">
                  time window and format<svg className="uc-hand uc-under" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true">
                    <path pathLength="1" d="M2 7 C52 3 101 10 151 6 C199 3 251 5 298 8" />
                  </svg>
                </span> — in person or online.
              </p>
            </div>
            <p style={{ margin: "0", color: "var(--text)", maxWidth: "420px" }}>Every requirement traces back to an answer. Change the answer and Nautilus tells you which sections may be out of date.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(UpClose);
