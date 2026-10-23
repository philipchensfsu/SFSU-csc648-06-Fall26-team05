

// ABOUT US
export default function AboutHero({ v }) {
  return (
    <section onMouseMove={v.onHeroMove} style={{ position: "relative", padding: "104px 24px 88px", overflow: "hidden" }}>
      <div className="gridbg" aria-hidden="true" style={{ position: "absolute", inset: "0", pointerEvents: "none" }} />
      <div className="spot-clip" aria-hidden="true">
        <div className="spot">
          <div className="spot-grid" />
        </div>
      </div>
      <div className="ab-bignum" aria-hidden="true">05</div>
      {/* the crew: a school of seven, and the nautilus keeping an eye on them */}
      <div className="sea sea-zone ab-crew" aria-hidden="true">
        <div className="swim-home" style={{ left: "calc(46% + 0px)", top: "150px" }}>
          <div className="swim" data-sea="school" data-group="crew" data-ox="0" data-oy="0">
            <svg viewBox="0 0 40 16" width="44" height="17.6">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 46px)", top: "130px" }}>
          <div className="swim" data-sea="school" data-group="crew" data-ox="-46" data-oy="-20">
            <svg viewBox="0 0 40 16" width="38" height="15.2">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 42px)", top: "172px" }}>
          <div className="swim" data-sea="school" data-group="crew" data-ox="-42" data-oy="22">
            <svg viewBox="0 0 40 16" width="40" height="16.0">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 88px)", top: "150px" }}>
          <div className="swim" data-sea="school" data-group="crew" data-ox="-88" data-oy="0">
            <svg viewBox="0 0 40 16" width="36" height="14.4">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% + 34px)", top: "132px" }}>
          <div className="swim" data-sea="school" data-group="crew" data-ox="34" data-oy="-18">
            <svg viewBox="0 0 40 16" width="38" height="15.2">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 84px)", top: "184px" }}>
          <div className="swim" data-sea="school" data-group="crew" data-ox="-84" data-oy="34">
            <svg viewBox="0 0 40 16" width="34" height="13.6">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(46% - 6px)", top: "188px" }}>
          <div className="swim" data-sea="school" data-group="crew" data-ox="-6" data-oy="38">
            <svg viewBox="0 0 40 16" width="36" height="14.4">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home hide-xs" style={{ left: "74%", top: "56%" }}>
          <div className="swim" data-sea="nautilus">
            <div className="bobY" style={{ animationDuration: "4.4s", animationDelay: "-1.6s" }}>
              <svg viewBox="0 0 76 60" width="78" height="61.6">
                <g className="n-tent k2" fill="none" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M54 38 q8 2 13 -1" />
                  <path d="M54 41 q9 5 15 4" />
                  <path d="M53 44 q7 7 13 9" />
                  <path d="M51 46 q4 8 9 12" />
                  <path d="M55 35 q7 -2 11 -6" />
                </g>
                <path className="s1" d="M34.1 31 L34.4 30.5 L34.6 29.9 L34.8 29.3 L34.9 28.7 L34.9 28.1 L35 27.4 L34.9 26.8 L34.9 26.1 L34.7 25.5 L34.5 24.8 L34.3 24.2 L34 23.5 L33.6 22.9 L33.2 22.3 L32.8 21.7 L32.3 21.2 L31.7 20.7 L31.1 20.2 L30.4 19.8 L29.7 19.4 L29 19 L28.2 18.8 L27.4 18.5 L26.6 18.4 L25.8 18.3 L24.9 18.3 L24 18.3 L23.1 18.4 L22.2 18.6 L21.4 18.8 L20.5 19.2 L19.6 19.6 L18.8 20 L18 20.6 L17.2 21.2 L16.5 21.9 L15.8 22.7 L15.1 23.5 L14.5 24.4 L14 25.3 L13.6 26.3 L13.2 27.3 L12.9 28.4 L12.7 29.5 L12.6 30.7 L12.5 31.8 L12.6 33 L12.7 34.2 L13 35.4 L13.3 36.6 L13.8 37.8 L14.3 38.9 L14.9 40.1 L15.7 41.2 L16.5 42.2 L17.4 43.2 L18.5 44.1 L19.6 45 L20.7 45.8 L22 46.5 L23.3 47.1 L24.7 47.6 L26.2 48 L27.7 48.3 L29.2 48.5 L30.8 48.5 L32.4 48.4 L34 48.2 L35.6 47.9 L37.2 47.4 L38.8 46.9 L40.4 46.1 L41.9 45.3 L43.4 44.3 L44.8 43.1 L46.1 41.9 L47.4 40.5 L48.6 39 L49.6 37.4 L50.6 35.7 Z" />
                <path className="s2" d="M13.9 37.6 L16.6 40.7 L20.3 35.4 ZM13.1 28.5 L13.5 32.1 L18.9 30.2 ZM17.3 21.5 L15.7 24.3 L20.5 25.6 ZM23.9 18.6 L21.3 19.8 L24 23.2 ZM30.1 19.9 L27.6 19.5 L27.8 23.3 Z" />
                <path className="k2" d="M29.4 28.1 L29.3 27.9 L29.3 27.7 L29.2 27.4 L29 27.2 L28.9 27 L28.7 26.8 L28.5 26.6 L28.3 26.4 L28.1 26.2 L27.8 26.1 L27.6 26 L27.3 25.9 L27 25.8 L26.7 25.8 L26.4 25.7 L26 25.8 L25.7 25.8 L25.4 25.9 L25.1 26 L24.8 26.1 L24.5 26.3 L24.2 26.5 L23.9 26.8 L23.6 27 L23.4 27.3 L23.2 27.6 L23 28 L22.9 28.4 L22.7 28.8 L22.7 29.2 L22.6 29.6 L22.6 30 L22.7 30.4 L22.7 30.9 L22.9 31.3 L23 31.7 L23.2 32.2 L23.5 32.6 L23.8 32.9 L24.1 33.3 L24.5 33.6 L24.9 33.9 L25.3 34.2 L25.8 34.4 L26.3 34.6 L26.8 34.8 L27.4 34.9 L28 34.9 L28.5 34.9 L29.1 34.8 L29.7 34.7 L30.3 34.5 L30.9 34.3 L31.4 34 L32 33.6 L32.5 33.2 L33 32.7 L33.4 32.2 L33.8 31.7 L34.1 31" fill="none" strokeWidth="2" strokeLinecap="round" />
                <path className="s4" d="M45 23 C52 21 58 27 58 34 C58 41 53 46 47 46 C46 38 45 30 45 23 Z" />
                <circle className="sw" cx="51.5" cy="31.5" r="4.4" />
                <circle className="se" cx="52.5" cy="31.9" r="2.6" />
                <circle className="sw" cx="53.4" cy="30.6" r=".9" />
                <path className="ke" d="M50.5 38.6 q2.4 1.8 4.6 .2" fill="none" strokeWidth="1.6" strokeLinecap="round" />
                <circle className="s3" cx="18" cy="17" r="2.2" />
                <circle className="s3" cx="13" cy="25" r="1.5" />
                <g className="k4" fill="none" strokeWidth="1.4">
                  <circle className="n-bub" cx="47" cy="50" r="2.4" />
                  <circle className="n-bub" cx="44" cy="52" r="1.7" />
                  <circle className="n-bub" cx="49" cy="53" r="1.3" />
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
      <span className="bubble hide-sm" aria-hidden="true" style={{ right: "9%", top: "380px", animationDelay: ".6s" }} />
      <span className="bubble b-sm hide-sm" aria-hidden="true" style={{ right: "7.5%", top: "400px", animationDelay: "2.4s" }} />
      <div style={{ position: "relative", zIndex: "2", maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "22px" }}>
        <div className="mono fu" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--accent)" }}>ABOUT US · TEAM 05</div>
        <h1 className="fu" style={{ margin: "0", fontSize: "clamp(46px, 6.4vw, 92px)", lineHeight: "0.98", letterSpacing: "-0.028em", fontWeight: "650", color: "var(--ink)", animationDelay: ".08s" }}>Meet our <span className="serif hl hl-load">team</span>.</h1>
        <p className="fu" style={{ margin: "0", maxWidth: "620px", fontSize: "19px", lineHeight: "1.6", color: "var(--text)", animationDelay: ".16s" }}>We are Team 05 of CSC 648 Section 06 at San Francisco State University. Over the course of the semester our seven members work together through the software engineering lifecycle, from requirements and design to implementation, testing, and delivery.</p>
        <dl className="ab-facts fu" style={{ animationDelay: ".24s" }}>
          <div>
            <dt>COURSE</dt>
            <dd>CSC 648 · Section 06</dd>
          </div>
          <div>
            <dt>SCHOOL</dt>
            <dd>San Francisco State University</dd>
          </div>
          <div>
            <dt>TEAM</dt>
            <dd>7 members</dd>
          </div>
          <div>
            <dt>TERM</dt>
            <dd>Fall 2026</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
