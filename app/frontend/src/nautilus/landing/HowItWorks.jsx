import { memo } from 'react';

// HOW IT WORKS
function HowItWorks() {
  return (
    <section id="how" className="how" style={{ position: "relative", padding: "104px 24px 120px", borderTop: "1px solid var(--line)" }}>
      {/* two shrimp darting about above the intro */}
      <div className="sea sea-zone hide-xs" aria-hidden="true" style={{ right: "3%", width: "36%", top: "22px", height: "150px" }}>
        <div className="swim-home" style={{ left: "18%", top: "42px" }}>
          <div className="swim" data-sea="shrimp">
            <svg viewBox="0 0 46 28" width="38" height="23.1">
              <g className="sh-ant k2" fill="none" strokeWidth="1.2" strokeLinecap="round">
                <path d="M38 9 C34 1 22 -1 12 3" />
                <path d="M39 9 C38 3 30 0 24 1" />
              </g>
              <g className="sh-legs k2" fill="none" strokeWidth="1.5" strokeLinecap="round">
                <path d="M17 18 l-1 5" />
                <path d="M22 19 l0 5" />
                <path d="M27 19 l1 5" />
                <path d="M32 18 l1.6 4.4" />
              </g>
              <path className="s2" d="M9 13 L1 7 Q3 13 1 19 Z" />
              <path className="s1" d="M8 14 C9 8 16 6 24 6 C33 6 41 9 42 13 C42 17 36 19 28 19 C20 19 13 19 8 14 Z" />
              <path className="k3" d="M15 8 Q13 13 15 18 M21 7 Q19 13 21 19 M27 7 Q25 13 27 19" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="36" cy="11" r="2.6" />
              <circle className="se" cx="36.6" cy="11.2" r="1.5" />
              <path className="s2" d="M41 12 L45 11 L41 14 Z" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "64%", top: "96px" }}>
          <div className="swim" data-sea="shrimp">
            <svg viewBox="0 0 46 28" width="32" height="19.5">
              <g className="sh-ant k2" fill="none" strokeWidth="1.2" strokeLinecap="round">
                <path d="M38 9 C34 1 22 -1 12 3" />
                <path d="M39 9 C38 3 30 0 24 1" />
              </g>
              <g className="sh-legs k2" fill="none" strokeWidth="1.5" strokeLinecap="round">
                <path d="M17 18 l-1 5" />
                <path d="M22 19 l0 5" />
                <path d="M27 19 l1 5" />
                <path d="M32 18 l1.6 4.4" />
              </g>
              <path className="s2" d="M9 13 L1 7 Q3 13 1 19 Z" />
              <path className="s1" d="M8 14 C9 8 16 6 24 6 C33 6 41 9 42 13 C42 17 36 19 28 19 C20 19 13 19 8 14 Z" />
              <path className="k3" d="M15 8 Q13 13 15 18 M21 7 Q19 13 21 19 M27 7 Q25 13 27 19" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="36" cy="11" r="2.6" />
              <circle className="se" cx="36.6" cy="11.2" r="1.5" />
              <path className="s2" d="M41 12 L45 11 L41 14 Z" />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "56px" }}>
        <div className="rv" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "640px" }}>
            <div className="mono" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--accent)" }}>HOW IT WORKS</div>
            <h2 style={{ margin: "0", fontSize: "clamp(36px, 4.6vw, 56px)", lineHeight: "1.04", letterSpacing: "-0.028em", fontWeight: "650", color: "var(--ink)" }}>Product thinking first. <span className="serif hl hl-scroll">AI second.</span></h2>
          </div>
          <p style={{ margin: "0", color: "var(--text)", fontSize: "17px", maxWidth: "380px" }}>About fifteen minutes from a one-line idea to a PRD you can share with your team.</p>
        </div>
        <div aria-hidden="true" style={{ position: "relative", height: "1px", background: "var(--line)" }}>
          <span className="howfill" style={{ position: "absolute", left: "0", right: "0", top: "-0.5px", height: "2px", background: "var(--brand)" }} />
          <div className="sea sea-zone" style={{ left: "0", right: "0", top: "-30px", height: "52px" }}>
            <div className="swim-home" style={{ left: "0", top: "18px" }}>
              <div className="swim" data-sea="linefish">
                <svg viewBox="0 0 48 30" width="36" height="23">
                  <path className="s2 tail" d="M3 5 L16 15 L3 25 Q7 15 3 5 Z" />
                  <path className="s2" d="M22 5 Q28 -1 34 5 Z" />
                  <ellipse className="s1" cx="28" cy="15" rx="16" ry="10.5" />
                  <path className="k3" d="M22 6.5 Q18.5 15 22 23.5" fill="none" strokeWidth="2.4" strokeLinecap="round" />
                  <circle className="sw" cx="36.5" cy="12.5" r="3.4" />
                  <circle className="se" cx="37.2" cy="12.8" r="2" />
                  <path className="ke" d="M40.5 18.5 q-2 1.6 -4 .6" fill="none" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
          <span className="shell" aria-hidden="true" style={{ right: "-2px", bottom: "0px" }}>
            <svg viewBox="0 0 44 44" width="30" height="30">
              <path className="h1 hk" d="M28.8 23 L28.8 22.4 L28.9 21.8 L28.8 21.2 L28.7 20.6 L28.6 19.9 L28.4 19.3 L28.1 18.7 L27.8 18.1 L27.4 17.6 L27 17 L26.5 16.5 L26 16.1 L25.4 15.6 L24.8 15.3 L24.2 14.9 L23.5 14.7 L22.7 14.4 L22 14.3 L21.2 14.2 L20.4 14.2 L19.7 14.2 L18.9 14.4 L18.1 14.5 L17.3 14.8 L16.5 15.1 L15.7 15.5 L15 16 L14.3 16.6 L13.7 17.2 L13.1 17.9 L12.5 18.6 L12.1 19.4 L11.6 20.2 L11.3 21.1 L11 22 L10.8 23 L10.7 24 L10.7 25 L10.7 26 L10.9 27 L11.1 28.1 L11.5 29.1 L11.9 30.1 L12.4 31 L13 32 L13.7 32.9 L14.5 33.7 L15.4 34.5 L16.3 35.2 L17.3 35.8 L18.4 36.3 L19.6 36.8 L20.8 37.1 L22 37.4 L23.3 37.5 L24.6 37.6 L25.9 37.5 L27.2 37.3 L28.5 37 L29.8 36.5 L31.1 36 L32.3 35.3 L33.5 34.5 L34.7 33.6 L35.7 32.6 L36.7 31.5 L37.6 30.3 L38.4 29 L39.1 27.6 L39.7 26.1 L40.2 24.6 L40.5 23 L28.8 23 Z" strokeWidth="2" strokeLinejoin="round" />
              <path className="hk" d="M32.5 33.8 Q32.1 31.5 31.1 27.8M22.3 36.2 Q23.4 34.6 25.1 31.6M14.3 31.7 Q15.9 31.4 18.8 30.4M11.9 23.9 Q13 24.8 15.4 25.9" fill="none" strokeWidth="2" strokeLinecap="round" />
              <path className="hk" d="M24.5 22.2 L24.4 21.9 L24.3 21.7 L24.2 21.4 L24.1 21.2 L23.9 21 L23.8 20.7 L23.5 20.5 L23.3 20.3 L23.1 20.2 L22.8 20 L22.5 19.9 L22.2 19.9 L21.9 19.8 L21.6 19.8 L21.2 19.8 L20.9 19.8 L20.6 19.9 L20.2 20 L19.9 20.2 L19.6 20.3 L19.3 20.6 L19 20.8 L18.8 21.1 L18.5 21.4 L18.3 21.7 L18.2 22.1 L18 22.4 L17.9 22.8 L17.9 23.2 L17.9 23.7 L17.9 24.1 L17.9 24.5 L18 24.9 L18.2 25.4 L18.4 25.8 L18.6 26.2 L18.9 26.5 L19.2 26.9 L19.6 27.2 L20 27.5 L20.4 27.7 L20.9 28 L21.4 28.1 L21.9 28.2 L22.4 28.3 L23 28.3 L23.5 28.3 L24.1 28.2 L24.6 28 L25.1 27.8 L25.7 27.6 L26.2 27.3 L26.6 26.9 L27.1 26.5 L27.5 26 L27.9 25.5 L28.2 24.9 L28.4 24.3 L28.6 23.7 L28.8 23" fill="none" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
        </div>
        <ol style={{ margin: "-24px 0 0", padding: "0", listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: "40px" }}>
          <li className="how-step" style={{ animationRange: "cover 22% cover 32%", display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="mono how-num" style={{ animationRange: "cover 22% cover 32%", fontSize: "56px", lineHeight: "1", fontWeight: "500", color: "var(--numfill)", WebkitTextStroke: "1px var(--stroke)" }}>01</span>
            <h3 style={{ margin: "0", fontSize: "22px", fontWeight: "600", letterSpacing: "-0.012em", color: "var(--ink)" }}>Answer guided questions</h3>
            <p style={{ margin: "0", color: "var(--text)" }}>Name the PRD, then answer seven short questions. Skip the optional ones — Nautilus marks what it had to assume.</p>
          </li>
          <li className="how-step" style={{ animationRange: "cover 32% cover 42%", display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="mono how-num" style={{ animationRange: "cover 32% cover 42%", fontSize: "56px", lineHeight: "1", fontWeight: "500", color: "var(--numfill)", WebkitTextStroke: "1px var(--stroke)" }}>02</span>
            <h3 style={{ margin: "0", fontSize: "22px", fontWeight: "600", letterSpacing: "-0.012em", color: "var(--ink)" }}>Generate a structured PRD</h3>
            <p style={{ margin: "0", color: "var(--text)" }}>Target users, user stories, numbered requirements and metrics, each in its own section with IDs your engineers can reference.</p>
          </li>
          <li className="how-step" style={{ animationRange: "cover 42% cover 52%", display: "flex", flexDirection: "column", gap: "12px" }}>
            <span className="mono how-num" style={{ animationRange: "cover 42% cover 52%", fontSize: "56px", lineHeight: "1", fontWeight: "500", color: "var(--numfill)", WebkitTextStroke: "1px var(--stroke)" }}>03</span>
            <h3 style={{ margin: "0", fontSize: "22px", fontWeight: "600", letterSpacing: "-0.012em", color: "var(--ink)" }}>Refine, save, come back</h3>
            <p style={{ margin: "0", color: "var(--text)" }}>Edit by hand or regenerate a single section. Then send it for sign-off — every save becomes a version your team can approve.</p>
          </li>
        </ol>
      </div>
      {/* a pufferfish pottering along the bottom; it puffs up when startled */}
      <div className="sea sea-zone" aria-hidden="true" style={{ left: "3%", right: "3%", bottom: "14px", height: "98px" }}>
        <div className="swim-home" style={{ left: "70%", top: "30px" }}>
          <div className="swim" data-sea="puffer">
            <div className="bobY" style={{ animationDuration: "3.8s" }}>
              <svg viewBox="0 0 62 54" width="52" height="45">
                <path className="s2 puff-spikes" d="M44 27.1 L50.8 29.9 L43.5 30.7 ZM42.6 33.2 L47.5 38.7 L40.5 36.2 ZM38.6 38 L40.7 45.1 L35.5 39.9 ZM33 40.7 L31.8 47.9 L29.4 41 ZM26.8 40.6 L22.5 46.6 L23.4 39.3 ZM21.2 37.9 L14.7 41.4 L18.7 35.2 ZM17.3 33 L10 33.4 L16.2 29.5 ZM16 26.9 L9.2 24.1 L16.5 23.3 ZM17.4 20.8 L12.5 15.3 L19.5 17.8 ZM21.4 16 L19.3 8.9 L24.5 14.1 ZM27 13.3 L28.2 6.1 L30.6 13 ZM33.2 13.4 L37.5 7.4 L36.6 14.7 ZM38.8 16.1 L45.3 12.6 L41.3 18.8 ZM42.7 21 L50 20.6 L43.8 24.5 Z" />
                <path className="s4 tail" d="M15 27 L5 20 Q8 27 5 34 Z" />
                <g className="puff-body">
                  <circle className="s1" cx="30" cy="27" r="15" />
                  <path className="s3" d="M16.2 31 C19 39 25 42 30 42 C35 42 41 39 43.8 31 C38 33.5 22 33.5 16.2 31 Z" />
                  <g className="s4">
                    <circle cx="22" cy="19" r="1.6" />
                    <circle cx="28" cy="15.5" r="1.3" />
                    <circle cx="20.5" cy="25" r="1.2" />
                    <circle cx="33" cy="19.5" r="1.1" />
                  </g>
                  <path className="s4 p-fin" d="M30 30 C26 30 23 33 23 36 C26 36 29 34 30 30 Z" />
                  <circle className="sw" cx="37" cy="22" r="5" />
                  <circle className="se" cx="38.2" cy="22.4" r="3" />
                  <circle className="sw" cx="39" cy="21.4" r="1" />
                  <circle className="ke" cx="44.6" cy="29" r="1.7" fill="none" strokeWidth="1.5" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(HowItWorks);
