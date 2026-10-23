import { memo } from 'react';

// MEETING SCHEDULE: pale-aqua band
function Meetings() {
  return (
    <section id="meetings" className="sec-band" style={{ position: "relative", overflow: "hidden", padding: "112px 24px 120px", background: "var(--bg)", color: "var(--text)" }}>
      <div className="sea sea-zone sea-back" aria-hidden="true" style={{ left: "1%", right: "1%", top: "12px", height: "96px" }}>
        <div className="swim-home" style={{ left: "70%", top: "10px" }}>
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
      <div style={{ position: "relative", zIndex: "2", maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "44px" }}>
        <div className="rv" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "640px" }}>
            <div className="mono" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--accent)" }}>MEETING SCHEDULE</div>
            <h2 style={{ margin: "0", fontSize: "clamp(36px, 4.6vw, 56px)", lineHeight: "1.04", letterSpacing: "-0.028em", fontWeight: "650", color: "var(--ink)" }}>We meet <span className="serif hl hl-scroll">twice a week</span>.</h2>
          </div>
          <p style={{ margin: "0", fontSize: "17px", color: "var(--text)", maxWidth: "380px" }}>We meet twice a week as a full team: once in class, once in person.</p>
        </div>
        <div className="ab-meet">
          <div className="rv" style={{ display: "flex", flexDirection: "column" }}>
            <ul className="ab-slots">
              <li>
                <span className="ab-day">Tuesdays</span>
                <span className="ab-when"><span className="ab-time">2:30 PM – 3:45 PM</span><span className="ab-place">In-Class</span></span>
              </li>
              <li>
                <span className="ab-day">Thursdays</span>
                <span className="ab-when"><span className="ab-time">1:30 PM – 3:30 PM</span><span className="ab-place">In-Person, Peninsula</span></span>
              </li>
            </ul>
            <p className="mono" style={{ margin: "16px 0 0", fontSize: "12px", letterSpacing: ".04em", color: "var(--muted)" }}>Times are local to San Francisco (PT).</p>
          </div>
          <div className="ab-week rv" aria-hidden="true">
            <div className="ab-wk-head"><span /><span>MON</span><span className="on">TUE</span><span>WED</span><span className="on">THU</span><span>FRI</span></div>
            <div className="ab-wk-body">
              <span className="ab-wk-line" style={{ top: "0" }} /><span className="ab-wk-line" style={{ top: "72px" }} /><span className="ab-wk-line" style={{ top: "144px" }} /><span className="ab-wk-line" style={{ top: "216px" }} /><span className="ab-wk-hour" style={{ top: "0" }}>1 PM</span><span className="ab-wk-hour" style={{ top: "72px" }}>2 PM</span><span className="ab-wk-hour" style={{ top: "144px" }}>3 PM</span><span className="ab-wk-hour" style={{ top: "216px" }}>4 PM</span>
              <div className="ab-wk-col" style={{ gridColumn: "2" }} />
              <div className="ab-wk-col on" style={{ gridColumn: "3" }}>
                <div className="ab-slot" style={{ top: "108px", height: "90px", background: "#85D1DB", color: "#102C33" }}><b>2:30–3:45 PM</b><span>In-Class</span></div>
              </div>
              <div className="ab-wk-col" style={{ gridColumn: "4" }} />
              <div className="ab-wk-col on" style={{ gridColumn: "5" }}>
                <div className="ab-slot" style={{ top: "36px", height: "144px", background: "#1D6F7A", color: "#FFFFFF" }}><b>1:30–3:30 PM</b><span>In-Person, Peninsula</span></div>
              </div>
              <div className="ab-wk-col" style={{ gridColumn: "6" }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(Meetings);
