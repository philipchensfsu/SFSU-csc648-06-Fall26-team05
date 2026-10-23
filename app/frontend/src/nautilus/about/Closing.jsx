import { memo } from 'react';
import links from '../links.js';

// CLOSING: aqua band
function Closing() {
  return (
    <section className="sec-cta" style={{ position: "relative", textAlign: "center", padding: "128px 24px 168px", background: "var(--bg)", color: "var(--text)" }}>
      <div className="surface" aria-hidden="true">
        <svg className="wv wv-back" viewBox="0 0 2600 44" width="2600" height="44" aria-hidden="true">
          <path className="s3" d="M-60 15 Q-5 8 50 15 T160 15 T270 15 T380 15 T490 15 T600 15 T710 15 T820 15 T930 15 T1040 15 T1150 15 T1260 15 T1370 15 T1480 15 T1590 15 T1700 15 T1810 15 T1920 15 T2030 15 T2140 15 T2250 15 T2360 15 T2470 15 T2580 15 T2690 15 T2800 15 T2910 15 L2910 44 L-60 44 Z" />
        </svg>
      </div>
      <div className="surface surface-front" aria-hidden="true">
        <svg className="wv wv-front" viewBox="0 0 2600 44" width="2600" height="44" aria-hidden="true">
          <path className="wv-fill" d="M0 20 Q40 15 80 20 T160 20 T240 20 T320 20 T400 20 T480 20 T560 20 T640 20 T720 20 T800 20 T880 20 T960 20 T1040 20 T1120 20 T1200 20 T1280 20 T1360 20 T1440 20 T1520 20 T1600 20 T1680 20 T1760 20 T1840 20 T1920 20 T2000 20 T2080 20 T2160 20 T2240 20 T2320 20 T2400 20 T2480 20 T2560 20 T2640 20 T2720 20 T2800 20 L2800 44 L0 44 Z" />
        </svg>
      </div>
      <div className="sea sea-zone" aria-hidden="true" style={{ left: "3%", width: "28%", bottom: "40px", height: "120px" }}>
        <div className="swim-home" style={{ left: "calc(40% + 0px)", top: "50px" }}>
          <div className="swim" data-sea="school" data-group="about-cta" data-ox="0" data-oy="0">
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
        <div className="swim-home" style={{ left: "calc(40% - 28px)", top: "38px" }}>
          <div className="swim" data-sea="school" data-group="about-cta" data-ox="-28" data-oy="-12">
            <svg viewBox="0 0 40 16" width="20" height="8.0">
              <path className="s2" d="M3 3 L10 8 L3 13 Q5 8 3 3 Z" />
              <path className="s2" d="M19 3.2 Q23 0.4 27 3.2 Z" />
              <ellipse className="s4" cx="23" cy="8" rx="15" ry="5.6" />
              <path className="k3" d="M12.5 8.8 Q24 10.6 36 7.6" fill="none" strokeWidth="1.3" strokeLinecap="round" />
              <circle className="sw" cx="32.4" cy="6.7" r="1.9" />
              <circle className="se" cx="32.8" cy="6.8" r="1.1" />
            </svg>
          </div>
        </div>
        <div className="swim-home" style={{ left: "calc(40% - 24px)", top: "64px" }}>
          <div className="swim" data-sea="school" data-group="about-cta" data-ox="-24" data-oy="14">
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
      </div>
      <div className="sea" aria-hidden="true" style={{ position: "absolute", left: "2%", bottom: "0" }}>
        <svg viewBox="0 0 76 124" width="76" height="124">
          <g className="weed wd1">
            <path className="s4" d="M4 122 L4.7 117.3 L5.3 112.7 L6 108 L6.5 103.3 L6.9 98.7 L7.1 94 L7.1 89.3 L6.8 84.7 L6.2 80 L5.5 75.3 L4.6 70.7 L3.6 66 L2.6 61.3 L1.7 56.7 L1 52 L0.5 47.3 L0.3 42.7 L0.5 38 L1 33.3 L1.7 28.7 L2.8 24 L3.9 19.3 L5.1 14.7 L6.2 10 Q8.9 6.4 11.6 10 L11.6 10 L10.8 14.7 L9.9 19.3 L9 24 L8.2 28.7 L7.7 33.3 L7.5 38 L7.7 42.7 L8.1 47.3 L8.9 52 L9.9 56.7 L11.1 61.3 L12.3 66 L13.6 70.7 L14.7 75.3 L15.8 80 L16.6 84.7 L17.1 89.3 L17.5 94 L17.5 98.7 L17.4 103.3 L17.2 108 L16.8 112.7 L16.4 117.3 L16 122 Z" />
          </g>
          <g className="weed wd2">
            <path className="s1" d="M26 122 L26.6 118.5 L27.3 115 L27.9 111.5 L28.6 108 L29.1 104.5 L29.4 101 L29.6 97.5 L29.6 94 L29.4 90.5 L29 87 L28.6 83.5 L28.1 80 L27.6 76.5 L27.3 73 L27.1 69.5 L27.2 66 L27.6 62.5 L28.3 59 L29.3 55.5 L30.7 52 L32.3 48.5 L34 45 L35.9 41.5 L37.7 38 Q40.1 34.7 42.6 38 L42.6 38 L41.1 41.5 L39.5 45 L38 48.5 L36.6 52 L35.5 55.5 L34.7 59 L34.3 62.5 L34.1 66 L34.3 69.5 L34.7 73 L35.3 76.5 L36 80 L36.8 83.5 L37.5 87 L38.1 90.5 L38.6 94 L38.8 97.5 L38.9 101 L38.8 104.5 L38.5 108 L38.2 111.5 L37.8 115 L37.4 118.5 L37 122 Z" />
          </g>
          <g className="weed wd3">
            <path className="s2" d="M48 122 L48.5 119.6 L49.1 117.2 L49.6 114.8 L50 112.3 L50.4 109.9 L50.5 107.5 L50.5 105.1 L50.3 102.7 L49.9 100.2 L49.3 97.8 L48.6 95.4 L47.8 93 L47 90.6 L46.3 88.2 L45.8 85.8 L45.4 83.3 L45.3 80.9 L45.4 78.5 L45.8 76.1 L46.4 73.7 L47.3 71.2 L48.2 68.8 L49.2 66.4 L50.1 64 Q52.4 61 54.6 64 L54.6 64 L53.9 66.4 L53.2 68.8 L52.4 71.2 L51.8 73.7 L51.4 76.1 L51.3 78.5 L51.4 80.9 L51.7 83.3 L52.3 85.8 L53.1 88.2 L54 90.6 L55 93 L56 95.4 L57 97.8 L57.8 100.2 L58.4 102.7 L58.9 105.1 L59.1 107.5 L59.2 109.9 L59.1 112.3 L58.9 114.8 L58.6 117.2 L58.3 119.6 L58 122 Z" />
          </g>
        </svg>
      </div>
      <div className="sea hide-xs" aria-hidden="true" style={{ position: "absolute", right: "2.5%", bottom: "0" }}>
        <svg viewBox="0 0 76 124" width="58" height="95" style={{ transform: "scaleX(-1)" }}>
          <g className="weed wd1">
            <path className="s4" d="M4 122 L4.7 117.3 L5.3 112.7 L6 108 L6.5 103.3 L6.9 98.7 L7.1 94 L7.1 89.3 L6.8 84.7 L6.2 80 L5.5 75.3 L4.6 70.7 L3.6 66 L2.6 61.3 L1.7 56.7 L1 52 L0.5 47.3 L0.3 42.7 L0.5 38 L1 33.3 L1.7 28.7 L2.8 24 L3.9 19.3 L5.1 14.7 L6.2 10 Q8.9 6.4 11.6 10 L11.6 10 L10.8 14.7 L9.9 19.3 L9 24 L8.2 28.7 L7.7 33.3 L7.5 38 L7.7 42.7 L8.1 47.3 L8.9 52 L9.9 56.7 L11.1 61.3 L12.3 66 L13.6 70.7 L14.7 75.3 L15.8 80 L16.6 84.7 L17.1 89.3 L17.5 94 L17.5 98.7 L17.4 103.3 L17.2 108 L16.8 112.7 L16.4 117.3 L16 122 Z" />
          </g>
          <g className="weed wd2">
            <path className="s1" d="M26 122 L26.6 118.5 L27.3 115 L27.9 111.5 L28.6 108 L29.1 104.5 L29.4 101 L29.6 97.5 L29.6 94 L29.4 90.5 L29 87 L28.6 83.5 L28.1 80 L27.6 76.5 L27.3 73 L27.1 69.5 L27.2 66 L27.6 62.5 L28.3 59 L29.3 55.5 L30.7 52 L32.3 48.5 L34 45 L35.9 41.5 L37.7 38 Q40.1 34.7 42.6 38 L42.6 38 L41.1 41.5 L39.5 45 L38 48.5 L36.6 52 L35.5 55.5 L34.7 59 L34.3 62.5 L34.1 66 L34.3 69.5 L34.7 73 L35.3 76.5 L36 80 L36.8 83.5 L37.5 87 L38.1 90.5 L38.6 94 L38.8 97.5 L38.9 101 L38.8 104.5 L38.5 108 L38.2 111.5 L37.8 115 L37.4 118.5 L37 122 Z" />
          </g>
          <g className="weed wd3">
            <path className="s2" d="M48 122 L48.5 119.6 L49.1 117.2 L49.6 114.8 L50 112.3 L50.4 109.9 L50.5 107.5 L50.5 105.1 L50.3 102.7 L49.9 100.2 L49.3 97.8 L48.6 95.4 L47.8 93 L47 90.6 L46.3 88.2 L45.8 85.8 L45.4 83.3 L45.3 80.9 L45.4 78.5 L45.8 76.1 L46.4 73.7 L47.3 71.2 L48.2 68.8 L49.2 66.4 L50.1 64 Q52.4 61 54.6 64 L54.6 64 L53.9 66.4 L53.2 68.8 L52.4 71.2 L51.8 73.7 L51.4 76.1 L51.3 78.5 L51.4 80.9 L51.7 83.3 L52.3 85.8 L53.1 88.2 L54 90.6 L55 93 L56 95.4 L57 97.8 L57.8 100.2 L58.4 102.7 L58.9 105.1 L59.1 107.5 L59.2 109.9 L59.1 112.3 L58.9 114.8 L58.6 117.2 L58.3 119.6 L58 122 Z" />
          </g>
        </svg>
      </div>
      <span className="shell" aria-hidden="true" style={{ left: "11%", bottom: "13.2px", rotate: "-10deg" }}>
        <svg viewBox="0 9 48 36" width="40" height="30">
          <path className="h1 hk" d="M14 35 L34 35 L31 42.5 L17 42.5 Z" strokeWidth="2" strokeLinejoin="round" />
          <path className="h1 hk" d="M20.5 38 L2.4 30.1 Q1 24.7 6.4 23.2 Q6.9 17.6 12.5 18.1 Q14.9 13 20 15.3 Q24 11.4 28 15.3 Q33.1 13 35.5 18.1 Q41.1 17.6 41.6 23.2 Q47 24.7 45.6 30.1 L27.5 38 Z" strokeWidth="2" strokeLinejoin="round" />
          <path className="hk" d="M18.6 33.5 L7.5 24.2M20.5 31.9 L13.3 19.4M22.8 31.1 L20.3 16.8M25.2 31.1 L27.7 16.8M27.5 31.9 L34.8 19.4M29.4 33.5 L40.5 24.2" fill="none" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className="shell" aria-hidden="true" style={{ left: "25%", bottom: "8px" }}>
        <svg viewBox="0 4 52 38" width="52" height="38">
          <path className="h1 hk" d="M3 26 C5 35 14 39 26 39 C38 39 47 34 49 26 Z" strokeWidth="2" strokeLinejoin="round" />
          <path className="hk" d="M4.4 27.5 Q7.6 33.4 10.7 36.4M5.8 27.5 Q12.2 33.8 18.3 37.3M7.1 27.5 Q16.8 34.2 26 38.2M8.5 27.5 Q21.4 34.6 33.7 37.3M9.9 27.5 Q26 35 41.3 36.4" fill="none" strokeWidth="1.5" strokeLinecap="round" />
          <path className="h3" d="M5 26 C12 23.5 40 23.5 47 26 C40 28 12 28 5 26 Z" />
          <circle className="h4 hk" cx="30" cy="22" r="5.2" strokeWidth="1.6" />
          <circle className="h3" cx="28.2" cy="20.3" r="1.5" />
          <g className="clam-lid">
            <path className="h1 hk" d="M3 26 C5 17 14 12 26 12 C38 12 47 18 49 26 Z" strokeWidth="2" strokeLinejoin="round" />
            <path className="hk" d="M4.4 24.5 Q7.6 17.7 10.7 14.9M5.8 24.5 Q12.2 17.4 18.3 13.9M7.1 24.5 Q16.8 17.1 26 12.8M8.5 24.5 Q21.4 16.8 33.7 13.9M9.9 24.5 Q26 16.5 41.3 14.9" fill="none" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </svg>
      </span>
      <span className="shell hide-xs" aria-hidden="true" style={{ right: "24%", bottom: "4.5px", rotate: "70deg" }}>
        <svg viewBox="0 0 26 51" width="20" height="39.2">
          <path className="h1 hk" d="M13 2 C14.5 4 24 32 24 38 C24 45 19 49 13 49 C7 49 2 45 2 38 C2 32 11.5 4 13 2 Z" strokeWidth="2" strokeLinejoin="round" />
          <path className="hk" d="M11.1 11.7 Q13 12.9 14.9 7.9M9.4 17.2 Q13 18.4 16.6 13.4M7.8 22.7 Q13 23.9 18.2 18.9M6.1 28.1 Q13 29.3 19.9 24.3M4.4 33.6 Q13 34.8 21.6 29.8" fill="none" strokeWidth="1.6" strokeLinecap="round" />
          <path className="h3 hk" d="M7 41 C7 37 12 36 14 39 C16 42 13 46 9.5 45.5 C8 45.2 7 43.5 7 41 Z" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </span>
      <div style={{ position: "relative", zIndex: "2", maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "22px" }}>
        <h2 className="cta-zoom" style={{ margin: "0", fontSize: "clamp(40px, 5.6vw, 76px)", lineHeight: "1.0", letterSpacing: "-0.022em", fontWeight: "650", color: "var(--ink)", textWrap: "balance" }}>See what we’re <span className="serif hl">building</span>.</h2>
        <p style={{ margin: "0", maxWidth: "520px", fontSize: "18px", color: "var(--text)" }}>Nautilus turns a one-line idea into a structured PRD your team can review and approve.</p>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "12px 24px", paddingTop: "6px" }}>
          <a href={links.home} className="btn-w" style={{ display: "inline-flex", alignItems: "center", gap: "10px", height: "54px", padding: "0 26px", borderRadius: "12px", background: "var(--btn)", color: "var(--btn-ink)", textDecoration: "none", fontWeight: "600", fontSize: "16px" }}>
            Explore Nautilus<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </a><a href={links.signUp} className="btn-w" style={{ display: "inline-flex", alignItems: "center", height: "54px", padding: "0 24px", borderRadius: "12px", background: "#FFFFFF", color: "#102C33", textDecoration: "none", fontWeight: "600", fontSize: "16px" }}>Get started</a>
        </div>
      </div>
    </section>
  );
}

export default memo(Closing);
