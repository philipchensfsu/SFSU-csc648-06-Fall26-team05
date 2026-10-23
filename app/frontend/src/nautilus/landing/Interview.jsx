import { memo } from 'react';
import links from '../links.js';

// THE INTERVIEW: pale-aqua band, pinned, scrolls sideways
function Interview() {
  return (
    <section id="interview" className="hs-outer sec-band" aria-labelledby="hs-h" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="hs-sticky">
        <div className="hs-bgword" aria-hidden="true">DISCOVERY · DISCOVERY</div>
        {/* a sea turtle gliding along the top of the band; shells on its floor */}
        <div className="sea sea-zone sea-back" aria-hidden="true" style={{ left: "1%", right: "1%", top: "10px", height: "104px" }}>
          <div className="swim-home" style={{ left: "80%", top: "14px" }}>
            <div className="swim" data-sea="turtle">
              <div className="bobY">
                <svg viewBox="0 0 120 76" width="116" height="74">
                  <path className="s4 flip-f" d="M44 26 C30 10 16 6 8 10 C18 18 30 26 42 32 Z" />
                  <path className="s4 flip-f2" d="M44 50 C30 66 16 70 8 66 C18 58 30 50 42 44 Z" />
                  <path className="s4" d="M86 30 C96 22 106 20 112 22 C106 30 98 34 88 36 Z" />
                  <path className="s4" d="M86 46 C96 54 106 56 112 54 C106 46 98 42 88 40 Z" />
                  <path className="s4" d="M92 36 L104 38 L92 40 Z" />
                  <circle className="s4" cx="20" cy="38" r="12" />
                  <ellipse className="s2" cx="62" cy="38" rx="31" ry="21" />
                  <g className="k1" fill="none" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
                    <path d="M50 31 L57 25 L67 25 L74 31 L67 37 L57 37 Z" />
                    <path d="M50 31 L36 35" />
                    <path d="M74 31 L89 35" />
                    <path d="M57 37 L53 52" />
                    <path d="M67 37 L71 52" />
                    <path d="M57 25 L55 19" />
                    <path d="M67 25 L69 19" />
                  </g>
                  <circle className="sw" cx="15" cy="34" r="3.6" />
                  <circle className="se" cx="14.4" cy="34.4" r="2.1" />
                  <path className="ke" d="M10 43 q4 2.5 8 0" fill="none" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>
          <div className="swim-home" style={{ left: "calc(14% + 0px)", top: "44px" }}>
            <div className="swim" data-sea="school" data-group="hs" data-ox="0" data-oy="0">
              <svg viewBox="0 0 40 16" width="30" height="12.0">
                <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
                <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
                <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
                <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
                <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
                <circle className="se" cx="32.8" cy="6.8" r="1.1" />
              </svg>
            </div>
          </div>
          <div className="swim-home" style={{ left: "calc(14% - 32px)", top: "30px" }}>
            <div className="swim" data-sea="school" data-group="hs" data-ox="-32" data-oy="-14">
              <svg viewBox="0 0 40 16" width="26" height="10.4">
                <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
                <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
                <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
                <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
                <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
                <circle className="se" cx="32.8" cy="6.8" r="1.1" />
              </svg>
            </div>
          </div>
          <div className="swim-home" style={{ left: "calc(14% - 30px)", top: "59px" }}>
            <div className="swim" data-sea="school" data-group="hs" data-ox="-30" data-oy="15">
              <svg viewBox="0 0 40 16" width="28" height="11.2">
                <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
                <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
                <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
                <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
                <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
                <circle className="se" cx="32.8" cy="6.8" r="1.1" />
              </svg>
            </div>
          </div>
          <div className="swim-home" style={{ left: "calc(14% - 62px)", top: "44px" }}>
            <div className="swim" data-sea="school" data-group="hs" data-ox="-62" data-oy="0">
              <svg viewBox="0 0 40 16" width="24" height="9.6">
                <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
                <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
                <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
                <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
                <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
                <circle className="se" cx="32.8" cy="6.8" r="1.1" />
              </svg>
            </div>
          </div>
          <div className="swim-home" style={{ left: "calc(14% + 24px)", top: "32px" }}>
            <div className="swim" data-sea="school" data-group="hs" data-ox="24" data-oy="-12">
              <svg viewBox="0 0 40 16" width="26" height="10.4">
                <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
                <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
                <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
                <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
                <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
                <circle className="se" cx="32.8" cy="6.8" r="1.1" />
              </svg>
            </div>
          </div>
        </div>
        <span className="shell" aria-hidden="true" style={{ left: "3%", zIndex: "0", bottom: "25.1px", rotate: "12deg" }}>
          <svg viewBox="0 9 48 36" width="32" height="24">
            <path className="h1 hk" d="M14 35 L34 35 L31 42.5 L17 42.5 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="h1 hk" d="M20.5 38 L2.4 30.1 Q1 24.7 6.4 23.2 Q6.9 17.6 12.5 18.1 Q14.9 13 20 15.3 Q24 11.4 28 15.3 Q33.1 13 35.5 18.1 Q41.1 17.6 41.6 23.2 Q47 24.7 45.6 30.1 L27.5 38 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="hk" d="M18.6 33.5 L7.5 24.2M20.5 31.9 L13.3 19.4M22.8 31.1 L20.3 16.8M25.2 31.1 L27.7 16.8M27.5 31.9 L34.8 19.4M29.4 33.5 L40.5 24.2" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <span className="shell hide-xs" aria-hidden="true" style={{ left: "6.6%", zIndex: "0", bottom: "17.2px", rotate: "-70deg" }}>
          <svg viewBox="0 0 26 51" width="16" height="31.4">
            <path className="h1 hk" d="M13 2 C14.5 4 24 32 24 38 C24 45 19 49 13 49 C7 49 2 45 2 38 C2 32 11.5 4 13 2 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="hk" d="M11.1 11.7 Q13 12.9 14.9 7.9M9.4 17.2 Q13 18.4 16.6 13.4M7.8 22.7 Q13 23.9 18.2 18.9M6.1 28.1 Q13 29.3 19.9 24.3M4.4 33.6 Q13 34.8 21.6 29.8" fill="none" strokeWidth="1.6" strokeLinecap="round" />
            <path className="h3 hk" d="M7 41 C7 37 12 36 14 39 C16 42 13 46 9.5 45.5 C8 45.2 7 43.5 7 41 Z" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="shell" aria-hidden="true" style={{ right: "4%", zIndex: "0", bottom: "22px" }}>
          <svg viewBox="0 0 44 44" width="28" height="28">
            <path className="h1 hk" d="M28.8 23 L28.8 22.4 L28.9 21.8 L28.8 21.2 L28.7 20.6 L28.6 19.9 L28.4 19.3 L28.1 18.7 L27.8 18.1 L27.4 17.6 L27 17 L26.5 16.5 L26 16.1 L25.4 15.6 L24.8 15.3 L24.2 14.9 L23.5 14.7 L22.7 14.4 L22 14.3 L21.2 14.2 L20.4 14.2 L19.7 14.2 L18.9 14.4 L18.1 14.5 L17.3 14.8 L16.5 15.1 L15.7 15.5 L15 16 L14.3 16.6 L13.7 17.2 L13.1 17.9 L12.5 18.6 L12.1 19.4 L11.6 20.2 L11.3 21.1 L11 22 L10.8 23 L10.7 24 L10.7 25 L10.7 26 L10.9 27 L11.1 28.1 L11.5 29.1 L11.9 30.1 L12.4 31 L13 32 L13.7 32.9 L14.5 33.7 L15.4 34.5 L16.3 35.2 L17.3 35.8 L18.4 36.3 L19.6 36.8 L20.8 37.1 L22 37.4 L23.3 37.5 L24.6 37.6 L25.9 37.5 L27.2 37.3 L28.5 37 L29.8 36.5 L31.1 36 L32.3 35.3 L33.5 34.5 L34.7 33.6 L35.7 32.6 L36.7 31.5 L37.6 30.3 L38.4 29 L39.1 27.6 L39.7 26.1 L40.2 24.6 L40.5 23 L28.8 23 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="hk" d="M32.5 33.8 Q32.1 31.5 31.1 27.8M22.3 36.2 Q23.4 34.6 25.1 31.6M14.3 31.7 Q15.9 31.4 18.8 30.4M11.9 23.9 Q13 24.8 15.4 25.9" fill="none" strokeWidth="2" strokeLinecap="round" />
            <path className="hk" d="M24.5 22.2 L24.4 21.9 L24.3 21.7 L24.2 21.4 L24.1 21.2 L23.9 21 L23.8 20.7 L23.5 20.5 L23.3 20.3 L23.1 20.2 L22.8 20 L22.5 19.9 L22.2 19.9 L21.9 19.8 L21.6 19.8 L21.2 19.8 L20.9 19.8 L20.6 19.9 L20.2 20 L19.9 20.2 L19.6 20.3 L19.3 20.6 L19 20.8 L18.8 21.1 L18.5 21.4 L18.3 21.7 L18.2 22.1 L18 22.4 L17.9 22.8 L17.9 23.2 L17.9 23.7 L17.9 24.1 L17.9 24.5 L18 24.9 L18.2 25.4 L18.4 25.8 L18.6 26.2 L18.9 26.5 L19.2 26.9 L19.6 27.2 L20 27.5 L20.4 27.7 L20.9 28 L21.4 28.1 L21.9 28.2 L22.4 28.3 L23 28.3 L23.5 28.3 L24.1 28.2 L24.6 28 L25.1 27.8 L25.7 27.6 L26.2 27.3 L26.6 26.9 L27.1 26.5 L27.5 26 L27.9 25.5 L28.2 24.9 L28.4 24.3 L28.6 23.7 L28.8 23" fill="none" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        {/* a manta ray gliding along the floor of the band */}
        <div className="sea sea-zone sea-back" aria-hidden="true" style={{ left: "2%", right: "2%", bottom: "32px", height: "102px" }}>
          <div className="swim-home" style={{ left: "18%", top: "12px" }}>
            <div className="swim" data-sea="manta">
              <svg viewBox="0 0 96 80" width="92" height="77">
                <path className="k2" d="M30 40 C20 40 10 41 1 44" fill="none" strokeWidth="2" strokeLinecap="round" />
                <g className="m-wing m-up">
                  <path className="s2" d="M74 37 C68 27 58 14 44 3 C42 16 38 28 30 38 Z" />
                  <path className="s4" d="M66 34 C62 28 56 21 50 16 C50 23 48 30 44 35 Z" />
                </g>
                <g className="m-wing m-down">
                  <path className="s2" d="M74 43 C68 53 58 66 44 77 C42 64 38 52 30 42 Z" />
                  <path className="s4" d="M66 46 C62 52 56 59 50 64 C50 57 48 50 44 45 Z" />
                </g>
                <path className="s2" d="M80 40 C78 33 72 29 62 29 C48 29 36 33 28 40 C36 47 48 51 62 51 C72 51 78 47 80 40 Z" />
                <path className="s2" d="M78 34 C82 32 87 32.5 89 34.5 C85.5 36.2 81.5 36.5 78.5 36.2 Z" />
                <path className="s2" d="M78 46 C82 48 87 47.5 89 45.5 C85.5 43.8 81.5 43.5 78.5 43.8 Z" />
                <circle className="sw" cx="76" cy="35.6" r="1.7" />
                <circle className="sw" cx="76" cy="44.4" r="1.7" />
                <path className="k4" d="M44 40 L66 40" fill="none" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: "1", maxWidth: "1200px", margin: "0 auto 48px", padding: "0 24px", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "700px" }}>
            <div className="mono" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--accent)" }}>THE INTERVIEW</div>
            <h2 id="hs-h" style={{ margin: "0", fontSize: "clamp(36px, 4.6vw, 56px)", lineHeight: "1.04", letterSpacing: "-0.028em", fontWeight: "650", color: "var(--ink)" }}>Seven questions. <span className="serif hl">Every section</span> accounted for.</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "220px" }}>
            <span className="mono" style={{ fontSize: "13px", letterSpacing: ".06em", color: "var(--text)" }}>
              <span className="hs-countwrap">QUESTION <span className="hs-count" aria-hidden="true" /> / 07</span>
              <span className="hs-hint">SCROLL SIDEWAYS →</span>
            </span>
            <span style={{ display: "block", height: "2px", background: "var(--line)", borderRadius: "1px", overflow: "hidden" }}>
              <span className="hs-bar" style={{ display: "block", height: "2px", background: "var(--brand)" }} />
            </span>
          </div>
        </div>
        <div className="hs-scroller">
          <div className="hs-track">
            <div className="hs-panel">
              <span className="mono hs-num" style={{ animationRange: "contain -6.9% contain 21.1%", fontSize: "84px", lineHeight: "1", fontWeight: "500", color: "transparent", WebkitTextStroke: "1px var(--stroke)" }}>01</span>
              <h3 style={{ margin: "0", fontSize: "32px", fontWeight: "600", letterSpacing: "-0.02em", color: "var(--ink)" }}>Problem</h3>
              <p className="serif" style={{ margin: "0", fontSize: "26px", lineHeight: "1.2", color: "var(--text)" }}>“What’s broken today, and how do people cope?”</p>
              <p className="mono" style={{ margin: "auto 0 0", paddingTop: "18px", borderTop: "1px solid var(--line)", fontSize: "12px", lineHeight: "1.7", letterSpacing: ".04em", color: "var(--label)" }}>FEEDS → <span style={{ color: "var(--ink)" }}>§1 PROBLEM STATEMENT</span></p>
            </div>
            <div className="hs-panel">
              <span className="mono hs-num" style={{ animationRange: "contain 7.4% contain 35.4%", fontSize: "84px", lineHeight: "1", fontWeight: "500", color: "transparent", WebkitTextStroke: "1px var(--stroke)" }}>02</span>
              <h3 style={{ margin: "0", fontSize: "32px", fontWeight: "600", letterSpacing: "-0.02em", color: "var(--ink)" }}>Target users</h3>
              <p className="serif" style={{ margin: "0", fontSize: "26px", lineHeight: "1.2", color: "var(--text)" }}>“Who are the primary users, and what gets in their way?”</p>
              <p className="mono" style={{ margin: "auto 0 0", paddingTop: "18px", borderTop: "1px solid var(--line)", fontSize: "12px", lineHeight: "1.7", letterSpacing: ".04em", color: "var(--label)" }}>FEEDS → <span style={{ color: "var(--ink)" }}>§4 TARGET USERS · §5 STORIES</span></p>
            </div>
            <div className="hs-panel">
              <span className="mono hs-num" style={{ animationRange: "contain 21.7% contain 49.7%", fontSize: "84px", lineHeight: "1", fontWeight: "500", color: "transparent", WebkitTextStroke: "1px var(--stroke)" }}>03</span>
              <h3 style={{ margin: "0", fontSize: "32px", fontWeight: "600", letterSpacing: "-0.02em", color: "var(--ink)" }}>Goals</h3>
              <p className="serif" style={{ margin: "0", fontSize: "26px", lineHeight: "1.2", color: "var(--text)" }}>“What should be true once this ships?”</p>
              <p className="mono" style={{ margin: "auto 0 0", paddingTop: "18px", borderTop: "1px solid var(--line)", fontSize: "12px", lineHeight: "1.7", letterSpacing: ".04em", color: "var(--label)" }}>FEEDS → <span style={{ color: "var(--ink)" }}>§2 GOALS</span></p>
            </div>
            <div className="hs-panel">
              <span className="mono hs-num" style={{ animationRange: "contain 36% contain 64%", fontSize: "84px", lineHeight: "1", fontWeight: "500", color: "transparent", WebkitTextStroke: "1px var(--stroke)" }}>04</span>
              <h3 style={{ margin: "0", fontSize: "32px", fontWeight: "600", letterSpacing: "-0.02em", color: "var(--ink)" }}>Scope</h3>
              <p className="serif" style={{ margin: "0", fontSize: "26px", lineHeight: "1.2", color: "var(--text)" }}>“What’s in for launch, and what’s deliberately out?”</p>
              <p className="mono" style={{ margin: "auto 0 0", paddingTop: "18px", borderTop: "1px solid var(--line)", fontSize: "12px", lineHeight: "1.7", letterSpacing: ".04em", color: "var(--label)" }}>FEEDS → <span style={{ color: "var(--ink)" }}>§3 NON-GOALS · §6 REQUIREMENTS</span></p>
            </div>
            <div className="hs-panel">
              <span className="mono hs-num" style={{ animationRange: "contain 50.3% contain 78.3%", fontSize: "84px", lineHeight: "1", fontWeight: "500", color: "transparent", WebkitTextStroke: "1px var(--stroke)" }}>05</span>
              <h3 style={{ margin: "0", fontSize: "32px", fontWeight: "600", letterSpacing: "-0.02em", color: "var(--ink)" }}>Constraints</h3>
              <p className="serif" style={{ margin: "0", fontSize: "26px", lineHeight: "1.2", color: "var(--text)" }}>“What limits time, budget, tech or privacy?”</p>
              <p className="mono" style={{ margin: "auto 0 0", paddingTop: "18px", borderTop: "1px solid var(--line)", fontSize: "12px", lineHeight: "1.7", letterSpacing: ".04em", color: "var(--label)" }}>FEEDS → <span style={{ color: "var(--ink)" }}>§6 REQUIREMENTS · §8 RISKS</span></p>
            </div>
            <div className="hs-panel">
              <span className="mono hs-num" style={{ animationRange: "contain 64.6% contain 92.6%", fontSize: "84px", lineHeight: "1", fontWeight: "500", color: "transparent", WebkitTextStroke: "1px var(--stroke)" }}>06</span>
              <h3 style={{ margin: "0", fontSize: "32px", fontWeight: "600", letterSpacing: "-0.02em", color: "var(--ink)" }}>Success metrics</h3>
              <p className="serif" style={{ margin: "0", fontSize: "26px", lineHeight: "1.2", color: "var(--text)" }}>“How will you know it’s working?”</p>
              <p className="mono" style={{ margin: "auto 0 0", paddingTop: "18px", borderTop: "1px solid var(--line)", fontSize: "12px", lineHeight: "1.7", letterSpacing: ".04em", color: "var(--label)" }}>FEEDS → <span style={{ color: "var(--ink)" }}>§7 SUCCESS METRICS</span></p>
            </div>
            <div className="hs-panel">
              <span className="mono hs-num" style={{ animationRange: "contain 78.9% contain 106.9%", fontSize: "84px", lineHeight: "1", fontWeight: "500", color: "transparent", WebkitTextStroke: "1px var(--stroke)" }}>07</span>
              <h3 style={{ margin: "0", fontSize: "32px", fontWeight: "600", letterSpacing: "-0.02em", color: "var(--ink)" }}>Notes</h3>
              <p className="serif" style={{ margin: "0", fontSize: "26px", lineHeight: "1.2", color: "var(--text)" }}>“Links, research, how it started. Skip anything — it becomes a flagged assumption.”</p>
              <p className="mono" style={{ margin: "auto 0 0", paddingTop: "18px", borderTop: "1px solid var(--line)", fontSize: "12px", lineHeight: "1.7", letterSpacing: ".04em", color: "var(--label)" }}>FEEDS → <span style={{ color: "var(--accent)" }}>§9 OPEN QUESTIONS</span></p>
            </div>
            <div className="hs-panel" style={{ justifyContent: "center", gap: "22px" }}>
              <p className="serif" style={{ margin: "0", fontSize: "48px", lineHeight: "1.05", color: "var(--ink)" }}>Then Nautilus <span className="hl">writes the PRD.</span></p>
              <p className="mono" style={{ margin: "0", fontSize: "12px", letterSpacing: ".06em", color: "var(--label)" }}>§1 — §9 · READY FOR REVIEW</p>
              <a href={links.signUp} className="navlink" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--accent)", textDecoration: "none", fontWeight: "600", fontSize: "17px" }}>
                Start the interview<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(Interview);
