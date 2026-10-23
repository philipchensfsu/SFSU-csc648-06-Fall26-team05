import links from '../links.js';

// HERO
export default function Hero({ v }) {
  return (
    <section onMouseMove={v.onHeroMove} style={{ position: "relative", padding: "64px 24px 40px" }}>
      <div className="gridbg" aria-hidden="true" style={{ position: "absolute", inset: "0", pointerEvents: "none" }} />
      <div className="spot-clip" aria-hidden="true">
        <div className="spot">
          <div className="spot-grid" />
        </div>
      </div>
      {/* little fish roaming the top of the hero, each on its own */}
      <div className="sea sea-zone" aria-hidden="true" style={{ left: "1.5%", right: "1.5%", top: "72px", height: "700px" }}>
        <div className="swim-home" style={{ left: "6%", top: "17%" }}>
          <div className="swim" data-sea="fish">
            <div className="bobY">
              <svg viewBox="0 0 48 30" width="40" height="25">
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
        <div className="swim-home" style={{ left: "81%", top: "30%" }}>
          <div className="swim" data-sea="fish">
            <div className="bobY" style={{ animationDelay: "-1s" }}>
              <svg viewBox="0 0 48 30" width="34" height="21">
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
        <div className="swim-home" style={{ left: "34%", top: "46%" }}>
          <div className="swim" data-sea="fish">
            <div className="bobY" style={{ animationDelay: "-2s" }}>
              <svg viewBox="0 0 48 30" width="26" height="16">
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
        <div className="swim-home hide-xs" style={{ left: "86%", top: "50%" }}>
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
      <span className="bubble hide-sm" aria-hidden="true" style={{ left: "8%", top: "330px", animationDelay: ".4s" }} />
      <span className="bubble b-sm hide-sm" aria-hidden="true" style={{ left: "6.5%", top: "350px", animationDelay: "2.2s" }} />
      <span className="bubble b-lg hide-sm" aria-hidden="true" style={{ right: "10%", top: "330px", animationDelay: "3.5s" }} />
      <div className="hero-par" style={{ position: "relative", zIndex: "2", maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "22px" }}>
        <a href="#demo" className="fu navlink" style={{ display: "inline-flex", alignItems: "center", gap: "10px", color: "var(--muted)", textDecoration: "none", fontSize: "14px" }}>
          <span style={{ position: "relative", display: "inline-flex", width: "8px", height: "8px" }}><span className="ping" style={{ position: "absolute", inset: "0", borderRadius: "50%", background: "var(--brand)" }} /><span style={{ position: "relative", width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand)" }} /></span><span><span style={{ color: "var(--ink)", fontWeight: "600" }}>New</span> — regenerate any section with one instruction</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
        <div className="wmh" aria-hidden="true" style={{ fontSize: "clamp(80px, 19vw, 276px)", margin: "-6px 0 -2px", userSelect: "none" }}>
          <span style={{ "--d": "40px", animationDelay: "0.05s, 0s", width: "0.679em", margin: "0 -0.060em" }}>
            <svg viewBox="-60 -860 679 980">
              <path d="M68 -535H194L199 -382L182 -387Q194 -470 240 -508Q286 -547 356 -547Q442 -547 490 -492Q538 -438 538 -344V0H399V-298Q399 -368 379 -402Q360 -436 312 -436Q262 -436 234 -400Q207 -364 207 -298V0H68Z" />
            </svg>
          </span><span style={{ "--d": "95px", animationDelay: "0.12s, 0s", width: "0.682em", margin: "0 -0.060em" }}>
            <svg viewBox="-60 -860 682 980">
              <path d="M40 -134Q40 -203 83 -242Q126 -281 215 -299L390 -334Q390 -388 365 -416Q340 -443 293 -443Q249 -443 224 -423Q198 -402 190 -363L49 -370Q64 -456 127 -502Q190 -547 293 -547Q410 -547 469 -490Q529 -433 529 -324V-136Q529 -114 536 -106Q544 -98 559 -98H575V0Q568 2 553 4Q539 5 525 5Q470 5 439 -22Q408 -50 408 -117L420 -108Q406 -54 355 -21Q303 12 227 12Q142 12 91 -27Q40 -66 40 -134ZM390 -215V-243L260 -216Q220 -208 202 -191Q184 -174 184 -147Q184 -118 202 -102Q222 -86 258 -86Q298 -86 328 -102Q358 -118 374 -147Q390 -176 390 -215Z" />
            </svg>
          </span><span style={{ "--d": "60px", animationDelay: "0.19s, 0s", width: "0.675em", margin: "0 -0.060em" }}>
            <svg viewBox="-60 -860 675 980">
              <path d="M68 -190V-535H207V-224Q207 -160 228 -130Q248 -100 292 -100Q341 -100 368 -133Q395 -166 395 -230V-535H534V0H407L404 -150L421 -146Q409 -68 364 -28Q319 12 244 12Q162 12 115 -41Q68 -94 68 -190Z" />
            </svg>
          </span><span style={{ "--d": "125px", animationDelay: "0.26s, 0s", width: "0.523em", margin: "0 -0.060em" }}>
            <svg viewBox="-60 -860 523 980">
              <path d="M128 -157V-660H267V-172Q267 -135 283 -120Q298 -106 333 -106H408V0H286Q204 0 166 -38Q128 -76 128 -157ZM43 -535H408V-430H43Z" />
            </svg>
          </span><span style={{ "--d": "75px", animationDelay: "0.33s, 0s", width: "0.360em", margin: "0 -0.060em" }}>
            <svg viewBox="-60 -860 360 980">
              <path d="M68 -535H207V0H68Z" />
              <circle className="wmh-dot" cx="138" cy="-702" r="90" />
            </svg>
          </span><span style={{ "--d": "110px", animationDelay: "0.40s, 0s", width: "0.398em", margin: "0 -0.060em" }}>
            <svg viewBox="-60 -860 398 980">
              <path d="M68 -133 68 -710H208V-148Q208 -126 218 -116Q228 -106 249 -106H286V0H202Q138 0 103 -32Q68 -64 68 -133Z" />
            </svg>
          </span><span style={{ "--d": "50px", animationDelay: "0.47s, 0s", width: "0.674em", margin: "0 -0.060em" }}>
            <svg viewBox="-60 -860 674 980">
              <path d="M68 -190V-535H207V-224Q207 -160 228 -130Q248 -100 292 -100Q341 -100 368 -133Q395 -166 395 -230V-535H534V0H407L404 -150L421 -146Q409 -68 364 -28Q319 12 244 12Q162 12 115 -41Q68 -94 68 -190Z" />
            </svg>
          </span><span style={{ "--d": "85px", animationDelay: "0.54s, 0s", width: "0.653em", margin: "0 -0.060em" }}>
            <svg viewBox="-60 -860 653 980">
              <path d="M40 -168 182 -174Q188 -133 216 -112Q242 -90 294 -90Q337 -90 360 -104Q384 -118 384 -146Q384 -164 375 -176Q366 -188 342 -196Q318 -205 271 -213Q188 -227 140 -248Q93 -268 73 -299Q53 -330 53 -377Q53 -454 113 -501Q172 -547 285 -547Q392 -547 452 -497Q512 -448 522 -365L382 -359Q376 -400 351 -422Q325 -445 284 -445Q242 -445 219 -428Q196 -410 196 -382Q196 -362 206 -348Q216 -335 239 -327Q261 -318 301 -312Q386 -300 435 -279Q484 -258 506 -227Q528 -196 528 -149Q528 -72 464 -30Q400 12 293 12Q214 12 159 -11Q103 -34 74 -74Q44 -115 40 -168Z" />
            </svg>
          </span>
        </div>
        <h1 style={{ margin: "0", maxWidth: "940px", fontSize: "clamp(34px, 4.6vw, 62px)", lineHeight: "1.08", letterSpacing: "-0.028em", fontWeight: "650", color: "var(--ink)", textWrap: "balance" }}>
          <span className="w" style={{ animationDelay: ".60s" }}>Turn</span><span className="w" style={{ animationDelay: ".66s" }}>rough</span><span className="w" style={{ animationDelay: ".72s" }}>ideas</span><span className="w" style={{ animationDelay: ".78s" }}>into</span><span className="w" style={{ animationDelay: ".84s" }}>PRDs</span><span className="w" style={{ animationDelay: ".90s" }}>your</span><span className="w rot serif" style={{ animationDelay: ".96s", letterSpacing: "-0.01em" }}>
            <span className="rot-in"><span className="hl hl-load">engineers</span><span className="hl hl-load">designers</span><span className="hl hl-load">whole team</span><span className="hl hl-load">engineers</span></span>
          </span><span className="w" style={{ animationDelay: "1.02s" }}>can</span><span className="w" style={{ animationDelay: "1.08s" }}>build</span><span className="w" style={{ animationDelay: "1.14s" }}>from.</span>
        </h1>
        <p className="fu" style={{ margin: "0", maxWidth: "620px", fontSize: "clamp(17px, 1.5vw, 19px)", color: "var(--text)", animationDelay: ".95s", textWrap: "pretty" }}>Nautilus interviews you like a seasoned product lead, then writes a structured PRD you can edit, regenerate and version one section at a time.</p>
        <div className="fu" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "22px", animationDelay: "1.05s" }}>
          <a href={links.signUp} className="btn-w" style={{ display: "inline-flex", alignItems: "center", gap: "10px", height: "52px", padding: "0 24px", borderRadius: "12px", background: "var(--btn)", color: "var(--btn-ink)", textDecoration: "none", fontWeight: "600", fontSize: "16px" }}>
            Start your first PRD<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a><a href="#demo" className="navlink" style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--ink)", textDecoration: "none", fontWeight: "500", fontSize: "16px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>See it work
          </a>
        </div>
      </div>
      {/* DEMO: four scenes on their own clocks; a cursor drives each one */}
      <div id="demo" style={{ position: "relative", zIndex: "2", maxWidth: "1120px", margin: "72px auto 0", display: "flex", flexDirection: "column", gap: "22px" }}>
        <div role="tablist" aria-label="Product demo" className="fu" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: "20px", animationDelay: "1.1s" }}>
          {v.tabs.map((t, i) => (
            <button key={i} type="button" role="tab" className="tab" aria-selected={t.selected} onClick={t.pick} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "10px", padding: "0 0 4px", border: "0", background: "transparent", textAlign: "left", font: "inherit", cursor: "pointer", color: t.color }}>
              <span aria-hidden="true" style={{ display: "block", width: "100%", height: "2px", background: "var(--line)", borderRadius: "1px", overflow: "hidden" }}>
                {t.active && <span className="tabbar" style={{ display: "block", height: "2px", background: "var(--brand)", animationDuration: t.dur }} />}
                {t.done && <span style={{ display: "block", width: "100%", height: "2px", background: "var(--brand)", opacity: ".45" }} />}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: "10px", fontWeight: "600", fontSize: "16px" }}><span className="mono" style={{ fontSize: "12px", fontWeight: "400", color: t.numColor }}>{t.num}</span>{t.label}</span>
              <span style={{ fontSize: "14px", color: t.descColor }}>{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="demo-scroll" style={{ transformOrigin: "50% 100%" }}>
          <div className="demo-mouse" onMouseMove={v.onDemoMove} onMouseLeave={v.onDemoLeave} style={{ transform: "perspective(1600px) rotateX(var(--ry, 0deg)) rotateY(var(--rx, 0deg))", transition: "transform .6s cubic-bezier(.2,.7,.2,1)" }}>
            <div className="tilt" style={{ padding: "1px", borderRadius: "18px", background: "var(--demo-border)", boxShadow: "var(--demo-shadow)" }}>
              <div style={{ background: "#FFFFFF", color: "#102C33", borderRadius: "17px", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 16px", borderBottom: "1px solid #DCEBEE", background: "#EEF6F7", fontSize: "13px", color: "#557479" }}>
                  <div className="lights" aria-hidden="true">
                    <span className="light" style={{ background: "#FF5F57" }}>
                      <svg viewBox="0 0 12 12">
                        <path d="M4 4l4 4M8 4 4 8" />
                      </svg>
                    </span><span className="light" style={{ background: "#FEBC2E" }}>
                      <svg viewBox="0 0 12 12">
                        <path d="M3.5 6h5" />
                      </svg>
                    </span><span className="light" style={{ background: "#28C840" }}>
                      <svg viewBox="0 0 12 12">
                        <path d="M6 3.5v5M3.5 6h5" />
                      </svg>
                    </span>
                  </div>
                  <span style={{ margin: "0 auto", display: "inline-flex", alignItems: "center", gap: "8px", padding: "3px 14px", borderRadius: "7px", background: "#FFFFFF", border: "1px solid #DCEBEE", fontSize: "12px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>nautilus.app/campusconnect/{v.t0 && <span className="d-tw d-tw-none" style={{ "--w": "136px", "--n": "22", "--t": "0.15s", "--d": "0.55s" }}>interview/target-users</span>}{v.t1 && <span className="d-tw d-tw-none" style={{ "--w": "66px", "--n": "10", "--t": "0.15s", "--d": "0.35s" }}>generating</span>}{v.t2 && <span className="d-tw d-tw-none" style={{ "--w": "106px", "--n": "16", "--t": "0.15s", "--d": "0.40s" }}>prd/requirements</span>}{v.t3 && <span className="d-tw d-tw-none" style={{ "--w": "61px", "--n": "9", "--t": "0.15s", "--d": "0.35s" }}>approvals</span>}
                  </span><span style={{ width: "50px" }} />
                </div>
                <div className="d-stage" aria-hidden="true">
                  {v.t0 && (
                    <div className="d-scene s1 demo-grid" style={{ height: "100%" }}>
                      <div className="demo-side d-side">
                        <div className="d-mono-label" style={{ padding: "0 8px 8px" }}>INTERVIEW · 7 QUESTIONS</div>
                        <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
                          <span className="d-qpill" aria-hidden="true" style={{ animation: "d-pill-down 0.5s cubic-bezier(.3,1.3,.5,1) 7.5s both" }} />
                          <div className="d-qrow" style={{ color: "#102C33" }}>
                            <span className="d-num d-num-done">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span><span>Problem</span>
                          </div>
                          <div className="d-qrow" style={{ color: "#102C33", animation: "d-row-off 0.3s cubic-bezier(.2,.8,.2,1) 7.45s both" }}>
                            <span className="d-num-stack">
                              <span className="d-num d-num-on" style={{ animation: "d-fade-out 0.25s cubic-bezier(.2,.8,.2,1) 7.45s both" }}>2</span><span className="d-num d-num-done" style={{ animation: "d-pop 0.4s cubic-bezier(.2,.8,.2,1) 7.5s both" }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="m5 12.5 4.5 4.5L19 7" style={{ strokeDasharray: "24", animation: "d-draw .35s ease-out 7.55s both" }} />
                                </svg>
                              </span>
                            </span><span>Target users</span>
                          </div>
                          <div className="d-qrow" style={{ color: "#155E68", fontWeight: "600", animation: "d-row-wake 0.3s cubic-bezier(.2,.8,.2,1) 7.55s both" }}><span className="d-num d-num-on" style={{ animation: "d-num-wake 0.3s cubic-bezier(.2,.8,.2,1) 7.55s both" }}>3</span><span>Goals</span></div>
                          <div className="d-qrow" style={{ color: "#557479" }}><span className="d-num d-num-todo">4</span><span>Scope</span></div>
                          <div className="d-qrow" style={{ color: "#557479" }}><span className="d-num d-num-todo">5</span><span>Constraints</span></div>
                          <div className="d-qrow" style={{ color: "#557479" }}><span className="d-num d-num-todo">6</span><span>Success metrics</span></div>
                          <div className="d-qrow" style={{ color: "#557479" }}><span className="d-num d-num-todo">7</span><span>Notes</span></div>
                        </div>
                      </div>
                      <div className="d-main">
                        <div className="d-segs"><span className="d-seg" style={{ background: "#102C33" }} /><span className="d-seg" style={{ background: "#102C33", animation: "d-seg-aqua-ink 0.3s cubic-bezier(.2,.8,.2,1) 7.55s both" }} /><span className="d-seg" style={{ background: "#85D1DB", animation: "d-seg-line-aqua 0.3s cubic-bezier(.2,.8,.2,1) 7.65s both" }} /><span className="d-seg" /><span className="d-seg" /><span className="d-seg" /><span className="d-seg" /></div>
                        <div style={{ position: "relative", flex: "1", minHeight: "0" }}>
                          <div className="d-q1" style={{ animation: "d-slide-out 0.45s cubic-bezier(.5,0,.7,.4) 7.7s both" }}>
                            <div className="d-mono-label" style={{ color: "#1D6F7A" }}>QUESTION 2 OF 7 · TARGET USERS · REQUIRED</div>
                            <div className="d-h">Who is CampusConnect for?</div>
                            <div className="d-answer">
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                <span className="d-chip">Intro-course undergrads</span><span className="d-chip">Transfer students</span><span className="d-chip d-chip-new" style={{ animation: "d-chip-in 0.5s cubic-bezier(.2,.9,.3,1.4) 6.4s both" }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#155E68" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m5 12.5 4.5 4.5L19 7" />
                                  </svg>Commuting students
                                </span>
                              </div>
                              <div className="d-lines">
                                <div><span className="d-tw d-tw-hold" style={{ "--w": "295px", "--n": "40", "--t": "0.4s", "--d": "1.18s" }}>First-years in 300-person intro courses.</span></div>
                                <div><span className="d-tw d-tw-hold" style={{ "--w": "305px", "--n": "40", "--t": "1.7264705882352942s", "--d": "1.18s" }}>Many don’t know anyone in the class yet.</span></div>
                                <div><span className="d-tw d-tw-hold" style={{ "--w": "336px", "--n": "43", "--t": "3.0529411764705885s", "--d": "1.26s" }}>Commuters can only meet evenings or online.</span></div>
                              </div>
                            </div>
                            <div className="d-ai" style={{ animation: "d-rise 0.5s cubic-bezier(.2,.8,.2,1) 4.51764705882353s both" }}>
                              <span className="d-ai-badge">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z" />
                                </svg>
                              </span>
                              <div style={{ display: "grid", minWidth: "0" }}>
                                <span className="d-dots" style={{ gridArea: "1/1", animation: "d-vis 0.70s linear 4.61764705882353s both" }}><i /><i /><i /></span>
                                <div style={{ gridArea: "1/1", display: "flex", flexDirection: "column", gap: "9px", animation: "d-fade-in 0.4s cubic-bezier(.2,.8,.2,1) 5.31764705882353s both" }}>
                                  <span style={{ fontSize: "14px" }}><strong style={{ fontWeight: "600", color: "#155E68" }}>Follow-up · </strong>Should commuting students be their own user group? Their availability changes the scheduling requirements.</span>
                                  <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <span className="d-btn-ai" data-c="a" style={{ animation: "d-press .32s ease 6.2s both" }}>
                                      <span style={{ gridArea: "1/1", animation: "d-fade-out 0.2s cubic-bezier(.2,.8,.2,1) 6.32s both" }}>+ Add as a user group</span><span style={{ gridArea: "1/1", display: "inline-flex", alignItems: "center", gap: "6px", animation: "d-fade-in 0.25s cubic-bezier(.2,.8,.2,1) 6.34s both" }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <path d="m5 12.5 4.5 4.5L19 7" />
                                        </svg>Added
                                      </span>
                                    </span><span style={{ padding: "5px 8px", color: "#3E5A60", fontSize: "13px" }}>Not now</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="d-foot"><span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#0E6139" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#1C9A62" }} />Saved as you go</span><span className="d-btn-next" data-c="b" style={{ animation: "d-press .32s ease 7.25s both" }}>Next question →</span></div>
                          </div>
                          <div className="d-q2" style={{ animation: "d-slide-in 0.55s cubic-bezier(.2,.8,.2,1) 8.0s both" }}>
                            <div className="d-mono-label" style={{ color: "#1D6F7A" }}>QUESTION 3 OF 7 · GOALS · REQUIRED</div>
                            <div className="d-h">What should be true once this ships?</div>
                            <div className="d-answer">
                              <div className="d-lines">
                                <div><span className="d-tw d-tw-blink" style={{ "--w": "421px", "--n": "58", "--t": "8.45s", "--d": "1.93s" }}>Every student in a pilot course finds a group in week one.</span></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <span className="d-cur" aria-hidden="true">
                        <svg width="20" height="24" viewBox="0 0 20 24">
                          <path d="M2 1.5v18.2l4.7-4.4 3.1 7 3.2-1.4-3.1-6.9H16z" fill="#102C33" stroke="#FFFFFF" strokeWidth="1.6" strokeLinejoin="round" />
                        </svg><span className="d-click d-click-1" /><span className="d-click d-click-2" />
                      </span>
                    </div>
                  )}
                  {v.t1 && (
                    <div className="d-scene s2" style={{ height: "100%", display: "flex", flexWrap: "wrap", textAlign: "left" }}>
                      <div className="d-genleft">
                        <div className="d-mono-label" style={{ color: "#1D6F7A" }}>CAMPUSCONNECT · PRD v1</div>
                        <div className="d-h" style={{ fontSize: "27px" }}>Building your PRD from 7 answers</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          <div className="d-bar">
                            <span className="d-bar-fill" />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#557479" }}>
                            <span style={{ display: "grid" }}><span style={{ gridArea: "1/1", animation: "d-vis 6.15s linear 0s both" }}>Drafting sections…</span><span style={{ gridArea: "1/1", color: "#0E6139", fontWeight: "500", animation: "d-fade-in 0.3s cubic-bezier(.2,.8,.2,1) 6.15s both" }}>Done</span></span>
                            <span className="d-pct" />
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "11px", fontSize: "14px" }}>
                          <div className="d-step" style={{ animation: "d-step-wake 0.3s cubic-bezier(.2,.8,.2,1) 0.2s both" }}>
                            <span className="d-stepicon">
                              <span style={{ gridArea: "1/1", animation: "d-vis 0.80s linear 0.2s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone" style={{ gridArea: "1/1", animation: "d-pop 0.35s cubic-bezier(.2,.8,.2,1) 1.0s both" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="m5 12.5 4.5 4.5L19 7" style={{ strokeDasharray: "24", animation: "d-draw .35s ease-out 1.05s both" }} />
                                </svg>
                              </span>
                            </span><span>Reading 7 interview answers</span>
                          </div>
                          <div className="d-step" style={{ animation: "d-step-wake 0.3s cubic-bezier(.2,.8,.2,1) 1.0s both" }}>
                            <span className="d-stepicon">
                              <span style={{ gridArea: "1/1", animation: "d-vis 1.60s linear 1.0s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone" style={{ gridArea: "1/1", animation: "d-pop 0.35s cubic-bezier(.2,.8,.2,1) 2.6s both" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="m5 12.5 4.5 4.5L19 7" style={{ strokeDasharray: "24", animation: "d-draw .35s ease-out 2.65s both" }} />
                                </svg>
                              </span>
                            </span><span>Writing target users and user stories</span>
                          </div>
                          <div className="d-step" style={{ animation: "d-step-wake 0.3s cubic-bezier(.2,.8,.2,1) 2.6s both" }}>
                            <span className="d-stepicon">
                              <span style={{ gridArea: "1/1", animation: "d-vis 1.80s linear 2.6s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone" style={{ gridArea: "1/1", animation: "d-pop 0.35s cubic-bezier(.2,.8,.2,1) 4.4s both" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="m5 12.5 4.5 4.5L19 7" style={{ strokeDasharray: "24", animation: "d-draw .35s ease-out 4.45s both" }} />
                                </svg>
                              </span>
                            </span><span>Numbering requirements <span className="d-fr" style={{ animation: "d-fr 1.5s steps(5, end) 2.8000000000000003s both" }} /></span>
                          </div>
                          <div className="d-step" style={{ animation: "d-step-wake 0.3s cubic-bezier(.2,.8,.2,1) 4.4s both" }}>
                            <span className="d-stepicon">
                              <span style={{ gridArea: "1/1", animation: "d-vis 1.40s linear 4.4s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone" style={{ gridArea: "1/1", animation: "d-pop 0.35s cubic-bezier(.2,.8,.2,1) 5.8s both" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="m5 12.5 4.5 4.5L19 7" style={{ strokeDasharray: "24", animation: "d-draw .35s ease-out 5.85s both" }} />
                                </svg>
                              </span>
                            </span><span>Flagging assumptions to confirm</span>
                          </div>
                        </div>
                      </div>
                      <div className="d-genright">
                        <div className="d-sec" style={{ animation: "d-row-in 0.4s cubic-bezier(.2,.8,.2,1) 0.45s both" }}>
                          <span className="d-sec-hl" style={{ animation: "d-vis 0.65s linear 0.45s both" }} /><span className="d-stepicon d-sm">
                            <span style={{ gridArea: "1/1", animation: "d-vis 0.50s linear 0.45s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone d-ok" style={{ gridArea: "1/1", animation: "d-pop 0.3s cubic-bezier(.2,.8,.2,1) 0.95s both" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span>
                          </span><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "12px", color: "#1D6F7A" }}>01</span><span>Problem statement</span><span className="d-skel" style={{ "--sw": "46%", animation: "d-skel .5s ease-out 0.5s both" }} />
                        </div>
                        <div className="d-sec" style={{ animation: "d-row-in 0.4s cubic-bezier(.2,.8,.2,1) 1.0s both" }}>
                          <span className="d-sec-hl" style={{ animation: "d-vis 0.65s linear 1.0s both" }} /><span className="d-stepicon d-sm">
                            <span style={{ gridArea: "1/1", animation: "d-vis 0.50s linear 1.0s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone d-ok" style={{ gridArea: "1/1", animation: "d-pop 0.3s cubic-bezier(.2,.8,.2,1) 1.5s both" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span>
                          </span><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "12px", color: "#1D6F7A" }}>02</span><span>Goals</span><span className="d-skel" style={{ "--sw": "38%", animation: "d-skel .5s ease-out 1.05s both" }} />
                        </div>
                        <div className="d-sec" style={{ animation: "d-row-in 0.4s cubic-bezier(.2,.8,.2,1) 1.55s both" }}>
                          <span className="d-sec-hl" style={{ animation: "d-vis 0.65s linear 1.55s both" }} /><span className="d-stepicon d-sm">
                            <span style={{ gridArea: "1/1", animation: "d-vis 0.50s linear 1.55s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone d-ok" style={{ gridArea: "1/1", animation: "d-pop 0.3s cubic-bezier(.2,.8,.2,1) 2.05s both" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span>
                          </span><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "12px", color: "#1D6F7A" }}>03</span><span>Non-goals</span><span className="d-skel" style={{ "--sw": "30%", animation: "d-skel .5s ease-out 1.6s both" }} />
                        </div>
                        <div className="d-sec" style={{ animation: "d-row-in 0.4s cubic-bezier(.2,.8,.2,1) 2.1s both" }}>
                          <span className="d-sec-hl" style={{ animation: "d-vis 0.65s linear 2.1s both" }} /><span className="d-stepicon d-sm">
                            <span style={{ gridArea: "1/1", animation: "d-vis 0.50s linear 2.1s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone d-ok" style={{ gridArea: "1/1", animation: "d-pop 0.3s cubic-bezier(.2,.8,.2,1) 2.6s both" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span>
                          </span><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "12px", color: "#1D6F7A" }}>04</span><span>Target users</span>
                          <span style={{ marginLeft: "auto", display: "flex", gap: "4px" }}><span className="d-pdot" style={{ background: "#85D1DB", animation: "d-pop 0.35s cubic-bezier(.2,.9,.3,1.5) 2.25s both" }} /><span className="d-pdot" style={{ background: "#B3EBF2", animation: "d-pop 0.35s cubic-bezier(.2,.9,.3,1.5) 2.4s both" }} /></span>
                        </div>
                        <div className="d-sec" style={{ animation: "d-row-in 0.4s cubic-bezier(.2,.8,.2,1) 2.6500000000000004s both" }}>
                          <span className="d-sec-hl" style={{ animation: "d-vis 0.65s linear 2.6500000000000004s both" }} /><span className="d-stepicon d-sm">
                            <span style={{ gridArea: "1/1", animation: "d-vis 0.50s linear 2.6500000000000004s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone d-ok" style={{ gridArea: "1/1", animation: "d-pop 0.3s cubic-bezier(.2,.8,.2,1) 3.1500000000000004s both" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span>
                          </span><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "12px", color: "#1D6F7A" }}>05</span><span>User stories</span><span style={{ marginLeft: "auto", fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "11px", color: "#557479" }}><span className="d-tw d-tw-none" style={{ "--w": "58px", "--n": "8", "--t": "2.7500000000000004s", "--d": "0.35s" }}>US-01…05</span></span>
                        </div>
                        <div className="d-sec" style={{ animation: "d-row-in 0.4s cubic-bezier(.2,.8,.2,1) 3.2s both" }}>
                          <span className="d-sec-hl" style={{ animation: "d-vis 0.65s linear 3.2s both" }} /><span className="d-stepicon d-sm">
                            <span style={{ gridArea: "1/1", animation: "d-vis 0.50s linear 3.2s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone d-ok" style={{ gridArea: "1/1", animation: "d-pop 0.3s cubic-bezier(.2,.8,.2,1) 3.7s both" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span>
                          </span><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "12px", color: "#1D6F7A" }}>06</span><span>Requirements</span><span style={{ marginLeft: "auto", fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "11px", color: "#557479" }}><span className="d-tw d-tw-none" style={{ "--w": "57px", "--n": "8", "--t": "3.3000000000000003s", "--d": "0.35s" }}>FR-01…06</span></span>
                        </div>
                        <div className="d-sec" style={{ animation: "d-row-in 0.4s cubic-bezier(.2,.8,.2,1) 3.7500000000000004s both" }}>
                          <span className="d-sec-hl" style={{ animation: "d-vis 0.65s linear 3.7500000000000004s both" }} /><span className="d-stepicon d-sm">
                            <span style={{ gridArea: "1/1", animation: "d-vis 0.50s linear 3.7500000000000004s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone d-ok" style={{ gridArea: "1/1", animation: "d-pop 0.3s cubic-bezier(.2,.8,.2,1) 4.25s both" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span>
                          </span><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "12px", color: "#1D6F7A" }}>07</span><span>Success metrics</span><span className="d-skel" style={{ "--sw": "34%", animation: "d-skel .5s ease-out 3.8000000000000003s both" }} />
                        </div>
                        <div className="d-sec" style={{ animation: "d-row-in 0.4s cubic-bezier(.2,.8,.2,1) 4.300000000000001s both" }}>
                          <span className="d-sec-hl" style={{ animation: "d-vis 0.65s linear 4.300000000000001s both" }} /><span className="d-stepicon d-sm">
                            <span style={{ gridArea: "1/1", animation: "d-vis 0.50s linear 4.300000000000001s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone d-ok" style={{ gridArea: "1/1", animation: "d-pop 0.3s cubic-bezier(.2,.8,.2,1) 4.800000000000001s both" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span>
                          </span><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "12px", color: "#1D6F7A" }}>08</span><span>Risks</span><span className="d-skel" style={{ "--sw": "28%", animation: "d-skel .5s ease-out 4.3500000000000005s both" }} />
                        </div>
                        <div className="d-sec" style={{ animation: "d-row-in 0.4s cubic-bezier(.2,.8,.2,1) 4.8500000000000005s both" }}>
                          <span className="d-sec-hl" style={{ animation: "d-vis 0.65s linear 4.8500000000000005s both" }} /><span className="d-stepicon d-sm">
                            <span style={{ gridArea: "1/1", animation: "d-vis 0.50s linear 4.8500000000000005s both" }}><span className="d-spin" aria-hidden="true" /></span><span className="d-stepdone d-ok" style={{ gridArea: "1/1", animation: "d-pop 0.3s cubic-bezier(.2,.8,.2,1) 5.3500000000000005s both" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="m5 12.5 4.5 4.5L19 7" />
                              </svg>
                            </span>
                          </span><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "12px", color: "#1D6F7A" }}>09</span><span>Open questions</span><span className="d-pill3" style={{ animation: "d-pop 0.35s cubic-bezier(.2,.9,.3,1.5) 5.4s both" }}>3 to confirm</span>
                        </div>
                      </div>
                      <div className="d-toast" style={{ animation: "d-toast-up 0.55s cubic-bezier(.2,.9,.3,1.25) 6.25s both" }}>
                        <span className="d-toast-ic">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m5 12.5 4.5 4.5L19 7" />
                          </svg>
                        </span><span><strong style={{ fontWeight: "600" }}>Your PRD is ready.</strong> 9 sections · 3 assumptions to confirm</span><span className="d-btn-open" data-c="a" style={{ animation: "d-press .32s ease 7.2s both" }}>Open PRD</span>
                      </div>
                      <span className="d-cur" aria-hidden="true">
                        <svg width="20" height="24" viewBox="0 0 20 24">
                          <path d="M2 1.5v18.2l4.7-4.4 3.1 7 3.2-1.4-3.1-6.9H16z" fill="#102C33" stroke="#FFFFFF" strokeWidth="1.6" strokeLinejoin="round" />
                        </svg><span className="d-click d-click-1" /><span className="d-click d-click-2" />
                      </span>
                    </div>
                  )}
                  {v.t2 && (
                    <div className="d-scene s3" style={{ height: "100%", padding: "26px 36px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", textAlign: "left" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: "13px", color: "#557479" }}>§6</span><span style={{ fontSize: "22px", fontWeight: "600", letterSpacing: "-0.015em" }}>Requirements</span><span className="d-ver"><span style={{ animation: "d-flip-out 0.25s ease-in 7.2s both" }}>v5</span><span className="d-ver-new" style={{ animation: "d-flip-in 0.35s cubic-bezier(.2,.9,.3,1.4) 7.42s both" }}>v6</span></span><span className="d-diffchip" style={{ animation: "d-vis 1.25s linear 6.15s both" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z" />
                          </svg>2 requirements rewritten · IDs kept
                        </span>
                      </div>
                      <div className="d-table">
                        <div className="d-frrow"><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", color: "#155E68", fontSize: "13px" }}>FR-01</span><span>Students sign in with a verified university email.</span><span className="d-pri" style={{ background: "#102C33", color: "#FFFFFF" }}>MUST</span></div>
                        <div className="d-frrow"><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", color: "#155E68", fontSize: "13px" }}>FR-02</span><span>The pilot runs at one campus, up to 8 courses per term.</span><span className="d-pri" style={{ background: "#102C33", color: "#FFFFFF" }}>MUST</span></div>
                        <div className="d-frrow" data-c="a">
                          <span className="d-rowhl" style={{ animation: "d-vis 1.00s linear 1.3s both" }} /><span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", color: "#155E68", fontSize: "13px" }}>FR-04</span>
                          <span style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}><span><span className="d-strike" style={{ "--st": "4.7s" }}>Users can search for groups easily.</span></span><span className="d-newline" style={{ animation: "d-fade-in 0.3s cubic-bezier(.2,.8,.2,1) 4.75s both" }}><span className="d-tw d-tw-hold" style={{ "--w": "526px", "--n": "76", "--t": "4.85s", "--d": "1.27s" }}>Students filter open groups by course, section, day, time window and format.</span></span></span>
                          <span className="d-pri" style={{ background: "#102C33", color: "#FFFFFF" }}>MUST</span>
                        </div>
                        <div className="d-frrow">
                          <span style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", color: "#155E68", fontSize: "13px" }}>FR-06</span>
                          <span style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}><span><span className="d-strike" style={{ "--st": "4.7s" }}>Members get reminders about sessions.</span></span><span className="d-newline" style={{ animation: "d-fade-in 0.3s cubic-bezier(.2,.8,.2,1) 4.75s both" }}><span className="d-tw d-tw-hold" style={{ "--w": "492px", "--n": "70", "--t": "5.15s", "--d": "1.17s" }}>Members get a reminder 2 hours before each session, with the location.</span></span></span>
                          <span className="d-pri" style={{ background: "#E4EFF1", color: "#3E5A60" }}>SHOULD</span>
                        </div>
                        <span className="d-scan" aria-hidden="true" />
                        <div className="d-toolbar" style={{ animation: "d-vis 0.85s linear 1.5s both" }}>
                          <span className="d-tb-btn" data-c="b" style={{ animation: "d-press .32s ease 2.1s both" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z" />
                            </svg>Regenerate
                          </span><span className="d-tb-btn" style={{ background: "transparent", color: "#3E5A60" }}>Comment</span>
                        </div>
                        <div className="d-prompt" style={{ animation: "d-vis 2.70s linear 2.35s both" }}>
                          <span style={{ color: "#1D6F7A", display: "inline-flex" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z" />
                            </svg>
                          </span>
                          <span style={{ display: "grid", flex: "1", minWidth: "0" }}><span style={{ gridArea: "1/1" }}><span className="d-tw d-tw-hold" style={{ "--w": "168px", "--n": "21", "--t": "2.5s", "--d": "1.05s" }}>Make these measurable</span></span><span className="d-think" style={{ gridArea: "1/1", animation: "d-vis 1.10s linear 3.95s both" }}>Rewriting FR-04 and FR-06<span className="d-dots d-dots-sm"><i /><i /><i /></span></span></span>
                          <span className="d-kbd" style={{ animation: "d-press .32s ease 3.8s both" }}>↵</span>
                        </div>
                      </div>
                      <div className="d-actions" style={{ animation: "d-rise 0.45s cubic-bezier(.2,.8,.2,1) 6.2s both" }}><span style={{ color: "#557479", marginRight: "auto" }}>Only §6 changes. The rest of the PRD stays as you left it.</span><span className="d-btn-ghost">Discard</span><span className="d-btn-teal" data-c="c" style={{ animation: "d-press .32s ease 7.0s both" }}>Replace section</span></div>
                      <div className="d-toast d-toast-tc" style={{ animation: "d-toast-down 0.5s cubic-bezier(.2,.9,.3,1.25) 7.35s both" }}>
                        <span className="d-toast-ic">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m5 12.5 4.5 4.5L19 7" />
                          </svg>
                        </span><span><strong style={{ fontWeight: "600" }}>Saved as v6.</strong> v5 is still in History.</span>
                      </div>
                      <span className="d-cur" aria-hidden="true">
                        <svg width="20" height="24" viewBox="0 0 20 24">
                          <path d="M2 1.5v18.2l4.7-4.4 3.1 7 3.2-1.4-3.1-6.9H16z" fill="#102C33" stroke="#FFFFFF" strokeWidth="1.6" strokeLinejoin="round" />
                        </svg><span className="d-click d-click-1" /><span className="d-click d-click-2" />
                      </span>
                    </div>
                  )}
                  {v.t3 && (
                    <div className="d-scene s4" style={{ height: "100%", display: "flex", flexWrap: "wrap", textAlign: "left" }}>
                      <div className="d-genleft" style={{ gap: "16px" }}>
                        <div className="d-mono-label" style={{ color: "#1D6F7A" }}>CAMPUSCONNECT · v6</div>
                        <div className="d-h" style={{ fontSize: "27px" }}>Ready for sign-off</div>
                        <div style={{ position: "relative", display: "inline-flex", alignSelf: "flex-start" }}>
                          <span className="d-status" style={{ display: "grid" }}><span className="d-st d-st-draft" style={{ gridArea: "1/1", animation: "d-vis 1.20s linear 0s both" }}><i />Draft</span><span className="d-st d-st-rev" style={{ gridArea: "1/1", animation: "d-vis 4.65s linear 1.2s both" }}><i />In review</span><span className="d-st d-st-final" style={{ gridArea: "1/1", animation: "d-final 0.55s cubic-bezier(.2,.9,.3,1.5) 5.85s both" }}><i />Final</span></span>
                          <span className="d-bubs" aria-hidden="true"><span className="d-bub" style={{ "--bx": "-16px", "--bs": "11px", animationDelay: "5.90s" }} /><span className="d-bub" style={{ "--bx": "8px", "--bs": "8px", animationDelay: "6.03s" }} /><span className="d-bub" style={{ "--bx": "22px", "--bs": "13px", animationDelay: "5.95s" }} /><span className="d-bub" style={{ "--bx": "-4px", "--bs": "7px", animationDelay: "6.19s" }} /><span className="d-bub" style={{ "--bx": "30px", "--bs": "8px", animationDelay: "6.33s" }} /><span className="d-bub" style={{ "--bx": "-26px", "--bs": "9px", animationDelay: "6.45s" }} /><span className="d-bub" style={{ "--bx": "14px", "--bs": "10px", animationDelay: "6.59s" }} /><span className="d-bub" style={{ "--bx": "-10px", "--bs": "6px", animationDelay: "6.75s" }} /></span>
                        </div>
                        <p style={{ margin: "0", fontSize: "14px", color: "#3E5A60", maxWidth: "340px" }}>Product, Engineering and Finance each approve this exact version. Edit it later and it comes back here.</p>
                        <span className="d-send" data-c="a" style={{ animation: "d-press .32s ease 1.0s both" }}>
                          <span style={{ gridArea: "1/1", display: "inline-flex", alignItems: "center", gap: "8px", animation: "d-fade-out 0.2s cubic-bezier(.2,.8,.2,1) 1.12s both" }}>Send for approval →</span><span style={{ gridArea: "1/1", display: "inline-flex", alignItems: "center", gap: "8px", animation: "d-fade-in 0.25s cubic-bezier(.2,.8,.2,1) 1.15s both" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m5 12.5 4.5 4.5L19 7" />
                            </svg>Sent to 3 approvers
                          </span>
                        </span><span className="d-signed" style={{ animation: "d-rise 0.45s cubic-bezier(.2,.8,.2,1) 6.199999999999999s both" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C9A62" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m5 12.5 4.5 4.5L19 7" />
                          </svg>Signed off — Engineering can start building.
                        </span>
                      </div>
                      <div className="d-genright" style={{ justifyContent: "center", gap: "0" }}>
                        <div className="d-apcard">
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                            <span style={{ fontWeight: "600", fontSize: "15px" }}>Approvals · v6</span>
                            <span style={{ display: "grid", fontSize: "13px", color: "#3E5A60" }}><span style={{ gridArea: "1/1", animation: "d-vis 2.50s linear 0s both" }}>0 of 3</span><span style={{ gridArea: "1/1", animation: "d-vis 1.25s linear 2.5s both" }}>1 of 3</span><span style={{ gridArea: "1/1", animation: "d-vis 1.25s linear 3.75s both" }}>2 of 3</span><span style={{ gridArea: "1/1", fontWeight: "600", color: "#0E6139", animation: "d-fade-in 0.25s cubic-bezier(.2,.8,.2,1) 5.0s both" }}>3 of 3</span></span>
                          </div>
                          <div className="d-apsegs"><span className="d-apseg"><span style={{ animation: "d-seg-fill 0.45s cubic-bezier(.3,.7,.3,1) 2.5s both" }} /></span><span className="d-apseg"><span style={{ animation: "d-seg-fill 0.45s cubic-bezier(.3,.7,.3,1) 3.75s both" }} /></span><span className="d-apseg"><span style={{ animation: "d-seg-fill 0.45s cubic-bezier(.3,.7,.3,1) 5.0s both" }} /></span></div>
                          <div className="d-aprow">
                            <span className="d-av" style={{ background: "#DDF3F6", color: "#155E68" }}>NH</span>
                            <span style={{ display: "flex", flexDirection: "column", lineHeight: "1.3", minWidth: "0" }}><span style={{ fontWeight: "600", fontSize: "14px" }}>Nadia Haddad</span><span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#557479" }}><span style={{ width: "7px", height: "7px", borderRadius: "2px", background: "#1D6F7A" }} />Product</span></span>
                            <span style={{ marginLeft: "auto" }}>
                              <span style={{ display: "grid", justifyItems: "end" }}>
                                <span className="d-ap d-ap-wait" style={{ gridArea: "1/1", animation: "d-vis 1.60s linear 0s both" }}>Not started</span><span className="d-ap d-ap-rev" style={{ gridArea: "1/1", animation: "d-vis 0.90s linear 1.6s both" }}><span className="d-pulse" />Reviewing</span><span className="d-ap d-ap-ok" style={{ gridArea: "1/1", animation: "d-pop 0.35s cubic-bezier(.2,.9,.3,1.5) 2.5s both" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C9A62" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m5 12.5 4.5 4.5L19 7" style={{ strokeDasharray: "24", animation: "d-draw .35s ease-out 2.55s both" }} />
                                  </svg>Approved
                                </span>
                              </span>
                            </span>
                          </div>
                          <div className="d-aprow">
                            <span className="d-av" style={{ background: "#E3ECF8", color: "#24508F" }}>KT</span>
                            <span style={{ display: "flex", flexDirection: "column", lineHeight: "1.3", minWidth: "0" }}><span style={{ fontWeight: "600", fontSize: "14px" }}>Ken Tanaka</span><span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#557479" }}><span style={{ width: "7px", height: "7px", borderRadius: "2px", background: "#3E73C2" }} />Engineering</span></span>
                            <span style={{ marginLeft: "auto" }}>
                              <span style={{ display: "grid", justifyItems: "end" }}>
                                <span className="d-ap d-ap-wait" style={{ gridArea: "1/1", animation: "d-vis 2.85s linear 0s both" }}>Not started</span><span className="d-ap d-ap-rev" style={{ gridArea: "1/1", animation: "d-vis 0.90s linear 2.85s both" }}><span className="d-pulse" />Reviewing</span><span className="d-ap d-ap-ok" style={{ gridArea: "1/1", animation: "d-pop 0.35s cubic-bezier(.2,.9,.3,1.5) 3.75s both" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C9A62" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m5 12.5 4.5 4.5L19 7" style={{ strokeDasharray: "24", animation: "d-draw .35s ease-out 3.8s both" }} />
                                  </svg>Approved
                                </span>
                              </span>
                            </span>
                          </div>
                          <div className="d-aprow">
                            <span className="d-av" style={{ background: "#E3F5EC", color: "#0E6139" }}>HO</span>
                            <span style={{ display: "flex", flexDirection: "column", lineHeight: "1.3", minWidth: "0" }}><span style={{ fontWeight: "600", fontSize: "14px" }}>Hannah Okafor</span><span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#557479" }}><span style={{ width: "7px", height: "7px", borderRadius: "2px", background: "#1C9A62" }} />Finance</span></span>
                            <span style={{ marginLeft: "auto" }}>
                              <span style={{ display: "grid", justifyItems: "end" }}>
                                <span className="d-ap d-ap-wait" style={{ gridArea: "1/1", animation: "d-vis 4.10s linear 0s both" }}>Not started</span><span className="d-ap d-ap-rev" style={{ gridArea: "1/1", animation: "d-vis 0.90s linear 4.1s both" }}><span className="d-pulse" />Reviewing</span><span className="d-ap d-ap-ok" style={{ gridArea: "1/1", animation: "d-pop 0.35s cubic-bezier(.2,.9,.3,1.5) 5.0s both" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1C9A62" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m5 12.5 4.5 4.5L19 7" style={{ strokeDasharray: "24", animation: "d-draw .35s ease-out 5.05s both" }} />
                                  </svg>Approved
                                </span>
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="d-notes">
                          <div className="d-note" style={{ animation: "d-vis 1.10s linear 2.55s both" }}>
                            <span className="d-av d-av-sm" style={{ background: "#DDF3F6", color: "#155E68" }}>NH</span><span><strong style={{ fontWeight: "600" }}>Nadia</strong> approved v6</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1C9A62" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m5 12.5 4.5 4.5L19 7" />
                            </svg>
                          </div>
                          <div className="d-note" style={{ animation: "d-vis 1.10s linear 3.8s both" }}>
                            <span className="d-av d-av-sm" style={{ background: "#E3ECF8", color: "#24508F" }}>KT</span><span><strong style={{ fontWeight: "600" }}>Ken</strong> approved v6</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1C9A62" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m5 12.5 4.5 4.5L19 7" />
                            </svg>
                          </div>
                          <div className="d-note" style={{ animation: "d-vis 1.10s linear 5.05s both" }}>
                            <span className="d-av d-av-sm" style={{ background: "#E3F5EC", color: "#0E6139" }}>HO</span><span><strong style={{ fontWeight: "600" }}>Hannah</strong> approved v6</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1C9A62" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m5 12.5 4.5 4.5L19 7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      <span className="d-cur" aria-hidden="true">
                        <svg width="20" height="24" viewBox="0 0 20 24">
                          <path d="M2 1.5v18.2l4.7-4.4 3.1 7 3.2-1.4-3.1-6.9H16z" fill="#102C33" stroke="#FFFFFF" strokeWidth="1.6" strokeLinejoin="round" />
                        </svg><span className="d-click d-click-1" /><span className="d-click d-click-2" />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
