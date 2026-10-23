import SeaPage from './SeaPage.js';
import SiteNav from './shared/SiteNav.jsx';
import AboutHero from './about/AboutHero.jsx';
import Team from './about/Team.jsx';
import Meetings from './about/Meetings.jsx';
import Communication from './about/Communication.jsx';
import Closing from './about/Closing.jsx';
import SiteFooter from './shared/SiteFooter.jsx';
import CursorBubbles from './shared/CursorBubbles.jsx';
import './nautilus.css';
import './about.css';

// the page root: background, text colour and type for everything inside
const ROOT_STYLE = { background: "var(--bg)", color: "var(--text)", fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: "16px", lineHeight: "1.55", overflowX: "clip" };

// The About us page: the crew, when we meet, how we talk.
// Props (all optional): theme "Light" | "Dark"; onNavigate(path) to route links like "/about" client-side;
// title to set the tab title (null leaves it alone).
export default class AboutPage extends SeaPage {
  static title = "Nautilus — About us";

  componentDidMount() {
    try {
      this.reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {
      this.reduce = false;
    }
    this.spotT = setTimeout(() => this.initSpot(), 0);
    this.onResize = () => {
      this.checkMotion();
      this.initSpot();
      this.seaMeasT = 0;
      if (this.secs && this.secUpdate) this.secs.forEach(this.secUpdate);
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
    clearTimeout(this.mt);
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

  renderVals() {
    const theme = this.props.theme ?? 'Light';
    const isDark = theme === 'Dark' || theme === 'Pastel dark';
    return {
      cbPool: this.getCb(),
      ringRef: this.ringRef,
      rootRef: this.rootRef || (this.rootRef = (el) => { this.root = el; }),
      rootClass: (isDark ? 'theme-dark' : 'theme-light') + ((this.state && this.state.motion) ? ' motion' : ' still'),
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
    };
  }

  render() {
    const v = this.renderVals();
    return (
      <div className={'nautilus-page ' + v.rootClass} ref={v.rootRef} onClick={this.onLinkClick} style={ROOT_STYLE}>
        <SiteNav page="about" email={this.props.email} onLogOut={this.props.onLogOut} />
        <AboutHero v={v} />
        <Team />
        <Meetings />
        <Communication />
        <Closing />
        <SiteFooter page="about" />
        <CursorBubbles pool={v.cbPool} ringRef={v.ringRef} />
      </div>
    );
  }
}
