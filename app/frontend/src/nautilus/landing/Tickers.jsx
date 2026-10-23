import { memo } from 'react';

// TICKERS
function Tickers() {
  return (
    <section aria-label="PRD sections" style={{ padding: "96px 0 0" }}>
      <div style={{ position: "relative", maxWidth: "1200px", margin: "0 auto 28px", padding: "0 24px", display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--label)" }}>EVERY PRD, THE SAME 9 SECTIONS</span><span className="mono" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--label)" }}>§1 — §9</span>{/* shells on the line, and a crab wandering among them */}
        <span className="shell" aria-hidden="true" style={{ left: "13%", bottom: "-27.2px", rotate: "-8deg" }}>
          <svg viewBox="0 9 48 36" width="28" height="21">
            <path className="h1 hk" d="M14 35 L34 35 L31 42.5 L17 42.5 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="h1 hk" d="M20.5 38 L2.4 30.1 Q1 24.7 6.4 23.2 Q6.9 17.6 12.5 18.1 Q14.9 13 20 15.3 Q24 11.4 28 15.3 Q33.1 13 35.5 18.1 Q41.1 17.6 41.6 23.2 Q47 24.7 45.6 30.1 L27.5 38 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="hk" d="M18.6 33.5 L7.5 24.2M20.5 31.9 L13.3 19.4M22.8 31.1 L20.3 16.8M25.2 31.1 L27.7 16.8M27.5 31.9 L34.8 19.4M29.4 33.5 L40.5 24.2" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="shell" aria-hidden="true" style={{ left: "57%", bottom: "-31.2px", rotate: "-68deg" }}>
          <svg viewBox="0 0 26 51" width="15" height="29.4">
            <path className="h1 hk" d="M13 2 C14.5 4 24 32 24 38 C24 45 19 49 13 49 C7 49 2 45 2 38 C2 32 11.5 4 13 2 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="hk" d="M11.1 11.7 Q13 12.9 14.9 7.9M9.4 17.2 Q13 18.4 16.6 13.4M7.8 22.7 Q13 23.9 18.2 18.9M6.1 28.1 Q13 29.3 19.9 24.3M4.4 33.6 Q13 34.8 21.6 29.8" fill="none" strokeWidth="1.6" strokeLinecap="round" />
            <path className="h3 hk" d="M7 41 C7 37 12 36 14 39 C16 42 13 46 9.5 45.5 C8 45.2 7 43.5 7 41 Z" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="shell hide-xs" aria-hidden="true" style={{ left: "80%", bottom: "-29px" }}>
          <svg viewBox="0 0 44 28" width="24" height="15.3">
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
        <div className="sea sea-zone sea-front" aria-hidden="true" style={{ left: "24px", right: "24px", bottom: "-29px", height: "40px" }}>
          <div className="swim-home" style={{ left: "30%", top: "0" }}>
            <div className="swim" data-sea="crab">
              <div className="scuttle">
                <svg viewBox="0 0 64 46" width="56" height="40">
                  <g className="k2" strokeWidth="2.6" strokeLinecap="round" fill="none">
                    <path d="M18 30 L9 34" />
                    <path d="M19 33 L11 39" />
                    <path d="M22 35 L16 42" />
                    <path d="M46 30 L55 34" />
                    <path d="M45 33 L53 39" />
                    <path d="M42 35 L48 42" />
                    <path d="M17 22 L12 16" />
                    <path d="M47 22 L52 16" />
                    <path d="M27 17 L25 9" />
                    <path d="M37 17 L39 9" />
                  </g>
                  <path className="s2 claw-l" d="M3 13 C3 6 10 3 14 7 L10 11 L15 12 C15 18 9 21 5 18 C3.6 16.8 3 15 3 13 Z" />
                  <path className="s2 claw-r" d="M61 13 C61 6 54 3 50 7 L54 11 L49 12 C49 18 55 21 59 18 C60.4 16.8 61 15 61 13 Z" />
                  <ellipse className="s1" cx="32" cy="26" rx="17" ry="11" />
                  <circle className="s3" cx="22.5" cy="27" r="2.4" />
                  <circle className="s3" cx="41.5" cy="27" r="2.4" />
                  <circle className="sw" cx="25" cy="8" r="3.6" />
                  <circle className="se" cx="25.4" cy="8.3" r="1.9" />
                  <circle className="sw" cx="39" cy="8" r="3.6" />
                  <circle className="se" cx="39.4" cy="8.3" r="1.9" />
                  <path className="ke" d="M28 28 q4 3 8 0" fill="none" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mq-wrap" style={{ borderTop: "1px solid var(--line)", padding: "26px 0 10px" }}>
        <div className="mq" style={{ fontSize: "30px", letterSpacing: "-0.012em", color: "var(--ticker)", whiteSpace: "nowrap" }}><span><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>01</span>Problem statement</span><span><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>02</span>Goals</span><span><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>03</span>Non-goals</span><span><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>04</span>Target users</span><span><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>05</span>User stories</span><span><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>06</span>Requirements</span><span><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>07</span>Success metrics</span><span><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>08</span>Risks</span><span><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>09</span>Open questions</span><span aria-hidden="true"><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>01</span>Problem statement</span><span aria-hidden="true"><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>02</span>Goals</span><span aria-hidden="true"><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>03</span>Non-goals</span><span aria-hidden="true"><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>04</span>Target users</span><span aria-hidden="true"><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>05</span>User stories</span><span aria-hidden="true"><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>06</span>Requirements</span><span aria-hidden="true"><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>07</span>Success metrics</span><span aria-hidden="true"><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>08</span>Risks</span><span aria-hidden="true"><span className="mono" style={{ fontSize: "13px", color: "var(--accent)", marginRight: "12px", verticalAlign: "super" }}>09</span>Open questions</span></div>
      </div>
      <div className="mq-wrap" style={{ borderBottom: "1px solid var(--line)", padding: "4px 0 26px" }}>
        <div className="tick2 serif" style={{ fontSize: "36px", color: "var(--ticker)" }}><span>Target users</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§4</span><span>User stories</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§5</span><span>Requirements</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§6</span><span>Success metrics</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§7</span><span>Risks</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§8</span><span>Open questions</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§9</span><span>Goals</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§2</span><span>Target users</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§4</span><span>User stories</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§5</span><span>Requirements</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§6</span><span>Success metrics</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§7</span><span>Risks</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§8</span><span>Open questions</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§9</span><span>Goals</span><span className="mono" style={{ fontStyle: "normal", fontSize: "13px", color: "var(--accent)" }}>§2</span></div>
      </div>
    </section>
  );
}

export default memo(Tickers);
