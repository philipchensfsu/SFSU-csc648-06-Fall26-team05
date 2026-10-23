import SeaPage from './SeaPage.js';
import SiteNav from './shared/SiteNav.jsx';
import Hero from './landing/Hero.jsx';
import Tickers from './landing/Tickers.jsx';
import WhyNautilus from './landing/WhyNautilus.jsx';
import HowItWorks from './landing/HowItWorks.jsx';
import Interview from './landing/Interview.jsx';
import UpClose from './landing/UpClose.jsx';
import WhoItsFor from './landing/WhoItsFor.jsx';
import FinalCta from './landing/FinalCta.jsx';
import SiteFooter from './shared/SiteFooter.jsx';
import CursorBubbles from './shared/CursorBubbles.jsx';
import './nautilus.css';

// the page root: background, text colour and type for everything inside
const ROOT_STYLE = { background: "var(--bg)", color: "var(--text)", fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: "16px", lineHeight: "1.55", overflowX: "clip" };

// The landing page.
// Props (all optional): theme "Light" | "Dark"; onNavigate(path) to route links like "/about" client-side;
// title to set the tab title (null leaves it alone).
export default class LandingPage extends SeaPage {
  static title = "Nautilus";

  componentDidMount() {
    try {
      this.reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      this.reduce = false;
    }
    this.demoOn = true;
    this.DUR = [9000, 8000, 9500, 8000];
    this.startCycle();
    this.queueCursor();
    setTimeout(() => this.placeCursor(), 600);
    // the hero's entrance is done by ~3s; after that its finished animations are dropped
    this.settleT = setTimeout(() => {
      this.setState({ settled: true });
      this.initSpot();
    }, 4200);
    this.spotT = setTimeout(() => this.initSpot(), 0);
    this.onResize = () => {
      this.checkMotion();
      this.queueCursor();
      this.initSpot();
      if (this.secs && this.secUpdate) this.secs.forEach(this.secUpdate);
      this.seaMeasT = 0;
    };
    window.addEventListener('resize', this.onResize);
    this.checkMotion();
    this.mt = setTimeout(() => this.checkMotion(), 500);

    // cursor bubbles: a soft bubble trails the pointer, small bubbles rise where it moves
    this.cbIdx = 0;
    this.lastSpawn = 0;
    this.lx = -999;
    this.ly = -999;
    this.tx = 0;
    this.ty = 0;
    this.cx = 0;
    this.cy = 0;
    this.raf = null;
    this.tick = () => {
      this.cx += (this.tx - this.cx) * 0.22;
      this.cy += (this.ty - this.cy) * 0.22;
      if (this.ring) this.ring.style.transform = 'translate(' + this.cx.toFixed(1) + 'px,' + this.cy.toFixed(1) + 'px) translate(-50%,-50%)';
      if (Math.abs(this.tx - this.cx) + Math.abs(this.ty - this.cy) > 0.4) this.raf = requestAnimationFrame(this.tick);
      else this.raf = null;
    };
    this.onPointer = (e) => {
      if (this.reduce || e.pointerType === 'touch') return;
      this.tx = e.clientX;
      this.ty = e.clientY;
      this.ptrT = performance.now();
      // hovering a shell lets out a little burst of bubbles
      const sh = e.target && e.target.closest ? e.target.closest('.shell') : null;
      if (sh !== this.lastShell) {
        this.lastShell = sh;
        if (sh) {
          const r = sh.getBoundingClientRect();
          for (let i = 0; i < 5; i++) this.spawn(r.left + r.width / 2, r.top + r.height * 0.3, true);
        }
      }
      if (!this.ringShown && this.ring) {
        this.cx = this.tx;
        this.cy = this.ty;
        this.ring.style.opacity = '1';
        this.ringShown = true;
      }
      if (!this.raf) this.raf = requestAnimationFrame(this.tick);
      const now = performance.now();
      const dist = Math.hypot(this.tx - this.lx, this.ty - this.ly);
      const gap = now - this.lastSpawn;
      if ((dist > 26 && gap > 55) || (dist > 4 && gap > 160)) this.spawn(this.tx, this.ty, false);
    };
    this.onDown = (e) => {
      if (this.reduce || e.pointerType === 'touch') return;
      for (let i = 0; i < 6; i++) this.spawn(e.clientX, e.clientY, true);
    };
    this.onLeave = () => {
      if (this.ring) this.ring.style.opacity = '0';
      this.ringShown = false;
      this.ptrT = 0;
    };
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('pointerdown', this.onDown, { passive: true });
    document.documentElement.addEventListener('mouseleave', this.onLeave);

    // the sea creatures swim on their own clock
    this.seaStart();

    // React integration: fonts, tab title, #anchor from another page
    this.prepareDocument();
  }

  componentWillUnmount() {
    clearTimeout(this.timer);
    clearTimeout(this.curT);
    clearTimeout(this.mt);
    clearTimeout(this.settleT);
    clearTimeout(this.spotT);
    (this.io || []).forEach((o) => o.disconnect());
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    if (this.onPointer) window.removeEventListener('pointermove', this.onPointer);
    if (this.onDown) window.removeEventListener('pointerdown', this.onDown);
    if (this.onLeave) document.documentElement.removeEventListener('mouseleave', this.onLeave);
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.seaRaf) cancelAnimationFrame(this.seaRaf);
    this.seaRaf = null;
  }

  // The demo only plays while it can be seen. Its timer and its CSS animations pause together, so coming
  // back it carries on from the same frame.
  demoVisible(on) {
    if (on === this.demoOn) return;
    this.demoOn = on;
    const cy = this.cycle;
    if (on) {
      this.runCycle();
      return;
    }
    clearTimeout(this.timer);
    if (cy && cy.at) cy.left = Math.max(0, cy.left - (performance.now() - cy.at));
  }

  startCycle(from) {
    clearTimeout(this.timer);
    this.cycle = null;
    if (this.reduce) return;                       // no auto-advance with reduced motion; tabs still work
    const i = from ?? ((this.state && this.state.tab) ?? 0);
    this.cycle = { i, left: this.DUR[i], at: 0 };
    this.runCycle();
  }

  runCycle() {
    const cy = this.cycle;
    clearTimeout(this.timer);
    if (!cy || this.demoOn === false) return;      // held while the demo is off screen
    cy.at = performance.now();
    this.timer = setTimeout(() => {
      const n = (cy.i + 1) % this.DUR.length;
      this.cycle = { i: n, left: this.DUR[n], at: 0 };
      this.setState({ tab: n });
      this.queueCursor();
      this.runCycle();
    }, cy.left);
  }

  queueCursor() {
    clearTimeout(this.curT);
    this.curT = setTimeout(() => this.placeCursor(), 60);
  }

  // Point the demo cursor at the real buttons: every [data-c] target sets --{key}x/--{key}y on the cursor,
  // measured in layout pixels (offsets ignore the window's tilt and the entrance animations).
  placeCursor() {
    const root = this.root;
    if (!root) return;
    const stage = root.querySelector('.d-stage');
    if (!stage) return;
    const cur = stage.querySelector('.d-cur');
    if (!cur) return;
    const off = (el) => {
      let x = 0, y = 0, n = el;
      while (n && n !== stage) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return n === stage ? [x, y] : null;
    };
    const W = stage.clientWidth, H = stage.clientHeight;
    cur.style.setProperty('--sx', Math.round(W * 0.78) + 'px');
    cur.style.setProperty('--sy', Math.round(H * 0.86) + 'px');
    stage.querySelectorAll('[data-c]').forEach((el) => {
      const p = off(el);
      if (!p) return;
      const k = el.getAttribute('data-c');
      cur.style.setProperty('--' + k + 'x', Math.round(p[0] + el.offsetWidth * 0.55) + 'px');
      cur.style.setProperty('--' + k + 'y', Math.round(p[1] + el.offsetHeight * 0.6) + 'px');
    });
  }

  renderVals() {
    const theme = this.props.theme ?? 'Light';
    const isDark = theme === 'Dark' || theme === 'Pastel dark';
    const tab = (this.state && this.state.tab) ?? 0;
    const defs = [
      { num: '01', label: 'Interview', desc: 'Answer seven questions' },
      { num: '02', label: 'Generate', desc: 'Get a structured PRD' },
      { num: '03', label: 'Refine', desc: 'Regenerate one section' },
      { num: '04', label: 'Sign off', desc: 'Approve it across teams' }
    ];
    const DURS = [9.0, 8.0, 9.5, 8.0];
    const tabs = defs.map((d, i) => {
      const on = i === tab;
      return {
        num: d.num,
        label: d.label,
        desc: d.desc,
        active: on,
        selected: on ? 'true' : 'false',
        color: on ? 'var(--ink)' : 'var(--label)',
        numColor: on ? 'var(--accent)' : 'var(--label)',
        descColor: on ? 'var(--text)' : 'var(--label)',
        dur: DURS[i] + 's',
        done: i < tab,
        pick: () => { this.setState({ tab: i }); this.queueCursor(); this.startCycle(i); }
      };
    });
    return {
      tabs,
      t0: tab === 0,
      t1: tab === 1,
      t2: tab === 2,
      t3: tab === 3,
      cbPool: this.getCb(),
      ringRef: this.ringRef,
      rootRef: this.rootRef || (this.rootRef = (el) => { this.root = el; }),
      rootClass: (isDark ? 'theme-dark' : 'theme-light') + ((this.state && this.state.motion) ? ' motion' : ' still') + ((this.state && this.state.settled) ? ' settled' : ''),
      onHeroMove: (e) => {
        if (this.reduce) return;
        this.heroPt = [e.clientX, e.clientY, e.currentTarget];
        if (this.heroRaf) return;
        this.heroRaf = requestAnimationFrame(() => {
          this.heroRaf = 0;
          const el = this.heroPt[2];
          if (!el || !el.getBoundingClientRect) return;
          const r = el.getBoundingClientRect();
          this.placeSpot(el, this.heroPt[0] - r.left, this.heroPt[1] - r.top);
        });
      },
      onDemoMove: (e) => {
        if (this.reduce) return;
        this.demoPt = [e.clientX, e.clientY, e.currentTarget];
        if (this.demoRaf) return;
        this.demoRaf = requestAnimationFrame(() => {
          this.demoRaf = 0;
          const el = this.demoPt[2];
          if (!el || !el.getBoundingClientRect) return;
          const r = el.getBoundingClientRect();
          const px = (this.demoPt[0] - r.left) / r.width;
          const py = (this.demoPt[1] - r.top) / r.height;
          el.style.setProperty('--rx', ((px - 0.5) * 6).toFixed(2) + 'deg');
          el.style.setProperty('--ry', ((0.5 - py) * 5).toFixed(2) + 'deg');
        });
      },
      onDemoLeave: (e) => {
        const el = e.currentTarget;
        if (this.demoRaf) cancelAnimationFrame(this.demoRaf);
        this.demoRaf = 0;
        if (!el) return;
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      }
    };
  }

  render() {
    const v = this.renderVals();
    return (
      <div className={'nautilus-page ' + v.rootClass} ref={v.rootRef} onClick={this.onLinkClick} style={ROOT_STYLE}>
        <SiteNav page="landing" email={this.props.email} onLogOut={this.props.onLogOut} />
        <Hero v={v} />
        <Tickers />
        <WhyNautilus />
        <HowItWorks />
        <Interview />
        <UpClose />
        <WhoItsFor />
        <FinalCta />
        <SiteFooter page="landing" />
        <CursorBubbles pool={v.cbPool} ringRef={v.ringRef} />
      </div>
    );
  }
}
