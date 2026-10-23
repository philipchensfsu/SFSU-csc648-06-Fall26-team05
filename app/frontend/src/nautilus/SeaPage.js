import { Component } from 'react';

// What the Nautilus pages share, written against the DOM: the pages render once, and this code animates
// them directly, so React never re-renders on an animation frame.
//   - sea creatures: each roams its own patch of the page, rests, turns, and reacts to the cursor
//   - cursor bubbles and the hero spotlight
//   - sections far off screen go idle (their CSS loops pause, their creatures stop being stepped)
//   - scroll-driven effects switch on only when the page really scrolls (state.motion -> .motion / .still)
// A page extends this class and renders its root element with ref={v.rootRef} (see LandingPage, AboutPage).
// With prefers-reduced-motion, nothing moves: no creatures, no cursor bubbles, CSS animations off.

export const FONTS_URL = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap";

export default class SeaPage extends Component {
  state = {};

  // Links to other app pages ("/about", "/signin", "/#how") go through props.onNavigate when it is given,
  // so a client-side router can take them; without it they are ordinary links. "#…" links scroll in place.
  onLinkClick = (e) => {
    const nav = this.props.onNavigate;
    if (!nav || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self')) return;
    const href = a.getAttribute('href');
    if (!href || href[0] !== '/' || href[1] === '/') return;
    e.preventDefault();
    nav(href);
  };

  // the fonts (once per document), the tab title, and scrolling to #anchor when arriving from another page
  prepareDocument() {
    if (!document.querySelector('link[href*="Bricolage+Grotesque"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONTS_URL;
      document.head.appendChild(link);
    }
    if (this.props.title !== null) document.title = this.props.title || this.constructor.title;
    const id = decodeURIComponent((window.location.hash || '').slice(1));
    if (!id || !this.root) return;
    const target = this.root.querySelector('#' + CSS.escape(id));
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  }

  // this page has no demo to pause
  demoVisible() {}

  getCb() {
    if (!this.cbDefs) {
      this.cbEls = [];
      const sizes = [7, 10, 13, 8, 11, 15, 9, 12, 6, 10, 14, 8, 11, 7, 13, 9, 12, 10, 8, 14, 6, 11, 9, 12];
      this.cbDefs = sizes.map((s, i) => ({ size: s + 'px', ref: (el) => { this.cbEls[i] = el; } }));
      this.ringRef = (el) => { this.ring = el; };
    }
    return this.cbDefs;
  }

  spawn(x, y, burst) {
    const pool = this.cbEls || [];
    if (!pool.length) return;
    const el = pool[this.cbIdx % pool.length];
    this.cbIdx += 1;
    this.lastSpawn = performance.now();
    this.lx = x;
    this.ly = y;
    if (!el || !el.animate) return;
    const dx = (Math.random() - 0.5) * (burst ? 80 : 28);
    const rise = (burst ? 50 : 36) + Math.random() * (burst ? 80 : 46);
    const dur = 900 + Math.random() * 800;
    const at = (fx, fy, s) => 'translate(' + fx.toFixed(1) + 'px,' + fy.toFixed(1) + 'px) translate(-50%,-50%) scale(' + s + ')';
    el.animate([
      { transform: at(x, y, 0.3), opacity: 0 },
      { transform: at(x + dx * 0.3, y - rise * 0.25, 0.95), opacity: 0.9, offset: 0.2 },
      { transform: at(x + dx, y - rise, 1.08), opacity: 0 }
    ], { duration: dur, easing: 'cubic-bezier(.25,.6,.3,1)' });
  }

  // ---------- the sea ----------
  // Every creature roams its own patch of the page on its own clock: it picks a
  // spot, swims there, sometimes rests, turns around smoothly and reacts when the
  // cursor gets close. None of it depends on scrolling.
  seaKinds() {
    return {
      fish: { speed: [18, 28], acc: 18, slow: 80, far: 200, vert: 0.45, rest: 0.18, restT: [1, 2.6], art: 1, flip: 5, tilt: 16, shy: 110 },
      linefish: { speed: [16, 24], acc: 16, slow: 60, far: 180, vert: 0.3, rest: 0.25, restT: [1, 2.4], art: 1, flip: 5, tilt: 12, shy: 100 },
      crab: { speed: [14, 22], acc: 60, slow: 30, far: 140, rest: 0.7, restT: [0.8, 2.8], line: 1, lean: 4, shy: 90 },
      jelly: { speed: [7, 11], acc: 5, slow: 70, far: 160, rest: 0.3, restT: [1.5, 3.5], jelly: 1, lean: 8 },
      turtle: { speed: [11, 16], acc: 5, slow: 100, far: 320, vert: 0.25, rest: 0.08, restT: [1.5, 3], art: -1, flip: 2.2, tilt: 6 },
      octo: { speed: [8, 12], acc: 14, slow: 50, far: 100, rest: 0.35, restT: [1.2, 3], jet: 22, lean: 14, shy: 120 },
      seahorse: { speed: [6, 10], acc: 5, slow: 50, far: 120, rest: 0.35, restT: [1.5, 3.5], art: -1, flip: 3, tilt: 5 },
      star: { speed: [11, 18], acc: 18, slow: 40, far: 120, rest: 0.6, restT: [1.2, 3.2], line: 1, roll: 1, shy: 90 },
      whale: { speed: [20, 30], acc: 7, slow: 150, far: 320, vert: 0.3, rest: 0.12, restT: [1.5, 3], art: -1, flip: 1.8, tilt: 8, whale: 1 },
      // a school swims as one: a shared destination, each fish keeping its own place
      school: { speed: [20, 28], acc: 44, slow: 70, far: 170, rest: 0, restT: [0, 0], art: 1, flip: 6, tilt: 14, shy: 95, school: 1 },
      manta: { speed: [12, 17], acc: 5, slow: 110, far: 300, vert: 0.25, rest: 0.05, restT: [1.5, 3], art: 1, flip: 1.8, tilt: 6, shy: 120 },
      // these three react to the cursor instead of fleeing it
      puffer: { speed: [9, 14], acc: 10, slow: 60, far: 140, vert: 0.5, rest: 0.3, restT: [1.5, 3.5], art: 1, flip: 4, tilt: 6, near: 100, puff: 1 },
      angler: { speed: [7, 11], acc: 5, slow: 60, far: 160, vert: 0.4, rest: 0.35, restT: [2, 4], art: 1, flip: 2.5, tilt: 5, near: 130, angler: 1 },
      dolphin: { speed: [28, 38], acc: 28, slow: 90, far: 260, rest: 0, restT: [0, 0], art: 1, flip: 4, tilt: 12, near: 170, dolphin: 1, surf: 150 },
      // the namesake: cruises in pushes, like the octopus, and puffs bubbles from its funnel on each one
      nautilus: { speed: [10, 15], acc: 9, slow: 80, far: 240, vert: 0.4, rest: 0.22, restT: [1.4, 3], art: 1, flip: 2.6, tilt: 8, jet: 20, jetBub: 1, shy: 120 },
      // walks the line, and pulls into its shell instead of running
      hermit: { speed: [7, 11], acc: 40, slow: 26, far: 110, rest: 0.6, restT: [1.2, 3], line: 1, art: 1, flip: 5, tilt: 0, shy: 100, duck: 1 },
      // paddles forward; flicks backwards when startled, and now and then for no reason at all
      shrimp: { speed: [9, 15], acc: 26, slow: 40, far: 120, vert: 0.6, rest: 0.45, restT: [0.8, 2.2], art: 1, flip: 6, tilt: 10, shy: 115, flick: 110 },
      // stays home: peeks out of its den and ducks back in if the cursor comes close
      eel: { still: 1, near: 150, speed: [0, 0] }
    };
  }

  // The hero spotlight is a 480px masked disc moved by transform; the grid inside it is shifted back by the
  // same amount mod 64, so its lines stay locked to the page grid behind it. Nothing repaints.
  placeSpot(hero, mx, my) {
    const spot = hero && hero.querySelector ? hero.querySelector('.spot') : null;
    if (!spot) return;
    const x = Math.round(mx - 240);
    const y = Math.round(my - 240);
    spot.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    const g = spot.firstElementChild;
    if (g) g.style.transform = 'translate(' + -(((x % 64) + 64) % 64) + 'px,' + -(((y % 64) + 64) % 64) + 'px)';
  }

  initSpot() {
    const scope = this.root || (typeof document !== 'undefined' ? document : null);
    const clip = scope && scope.querySelector ? scope.querySelector('.spot-clip') : null;
    if (clip && clip.parentElement) this.placeSpot(clip.parentElement, clip.clientWidth / 2, 220);
  }

  seaStart() {
    if (this.reduce || this.seaRaf) return;
    this.seaT = 0;
    this.seaF = 0;
    this.seaLoop = (now) => {
      this.seaRaf = requestAnimationFrame(this.seaLoop);
      if (!this.sea && !this.seaInit()) return;
      const dt = this.seaT ? Math.min(0.05, (now - this.seaT) / 1000) : 0;
      this.seaT = now;
      if (dt <= 0) return;
      if (now - (this.seaMeasT || 0) > 1200) {
        this.seaMeasT = now;
        // if the page re-rendered the creatures, pick up the new ones
        if (this.sea.some((c) => c.el.isConnected === false)) {
          this.sea = null;
          return;
        }
        this.seaMeasure();
        if (!this.io || !this.io.length) this.watch();
      }
      const ptrOn = !!this.ptrT && now - this.ptrT < 2500;
      const f = ++this.seaF;
      let awake = 0;
      // reads first: one rect per zone per frame, only while the cursor is around
      for (let i = 0; i < this.sea.length; i++) {
        const c = this.sea[i];
        c.on = !(c.sec && c.sec.__idle);
        if (!c.on) continue;
        awake++;
        if (ptrOn && c.zone.__f !== f) {
          c.zone.__f = f;
          c.zone.__r = c.zone.getBoundingClientRect();
        }
      }
      if (!awake) {
        // everything with creatures is off screen: sleep until a section wakes up
        cancelAnimationFrame(this.seaRaf);
        this.seaRaf = null;
        return;
      }
      this.seaSchools(dt);
      for (let i = 0; i < this.sea.length; i++) if (this.sea[i].on) this.seaStep(this.sea[i], dt, now, ptrOn);
    };
    this.seaRaf = requestAnimationFrame(this.seaLoop);
  }

  seaWake() {
    if (this.reduce || this.seaRaf || !this.seaLoop) return;
    this.seaT = 0;
    this.seaRaf = requestAnimationFrame(this.seaLoop);
  }

  // Sections nobody can see go idle: CSS pauses their loops (.idle) and the sea loop skips their creatures.
  // When the page scrolls itself, "can see" means within a third of a screen of the viewport, so a section is awake
  // before it scrolls in. In a frame as tall as the page (a design preview), it means actually on screen.
  watch() {
    const root = this.root || (typeof document !== 'undefined' ? document.querySelector('.theme-light, .theme-dark') : null);
    if (!root || typeof IntersectionObserver === 'undefined') return;
    (this.io || []).forEach((o) => o.disconnect());
    const secs = root.querySelectorAll(':scope > section, :scope > footer');
    this.secs = secs;
    this.secUpdate = (el) => {
      const se = document.scrollingElement || document.documentElement;
      const selfScroll = window.innerHeight < 2400 && se.scrollHeight - window.innerHeight > 200;
      const idle = el.__near === false || (!selfScroll && el.__seen === false);
      if (el.__idle === idle) return;
      el.__idle = idle;
      el.classList.toggle('idle', idle);
      if (el.querySelector('.d-stage')) this.demoVisible(!idle);
    };
    const make = (key, opt) => {
      const o = new IntersectionObserver((entries) => {
        for (let i = 0; i < entries.length; i++) {
          const el = entries[i].target;
          if (!el.isConnected) continue;
          el[key] = entries[i].isIntersecting;
          this.secUpdate(el);
        }
        this.seaWake();
      }, opt);
      for (let i = 0; i < secs.length; i++) o.observe(secs[i]);
      return o;
    };
    this.io = [];
    try {
      // the document as root keeps the margin working when the page runs inside a frame
      this.io.push(make('__near', { root: document, rootMargin: '30% 0px 30% 0px' }));
    } catch {
      this.io.push(make('__near', { rootMargin: '30% 0px 30% 0px' }));
    }
    this.io.push(make('__seen', {}));
  }

  seaInit() {
    const scope = this.root || (typeof document !== 'undefined' ? document : null);
    if (!scope || !scope.querySelectorAll) return false;
    const els = scope.querySelectorAll('[data-sea]');
    if (!els.length) return false;
    const kinds = this.seaKinds();
    const list = [];
    const groups = {};
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const k = kinds[el.getAttribute('data-sea')];
      const home = el.parentElement;
      const zone = home && home.parentElement;
      if (!k || !zone) continue;
      const c = {
        el, home, zone, k, ready: false, on: true,
        sec: zone.closest ? zone.closest('section, footer, header') : null,
        x: 0, y: 0, vx: 0, vy: 0, gx: 0, gy: 0,
        face: 1, fs: 1, pitch: 0, lean: 0, rot: 0, sq: 0,
        idle: 0, cruise: k.speed[0], boost: 0, fleeT: 0, rate: -1,
        jetT: 1 + Math.random() * 2, spoutT: 2.5 + Math.random() * 3, hiT: 0, curT: 0, inkT: 0,
        mode: 'swim', leapT: 2.5 + Math.random() * 3, prevCy: 0, splashI: 0,
        puffUntil: 0, autoPuff: 6 + Math.random() * 8, snapT: 0,
        group: null, ox: 0, oy: 0, mul: 1, phase: Math.random() * 6.28,
        spout: el.querySelector('.spout'),
        drops: el.querySelectorAll('.drop'),
        legs: el.querySelector('.scuttle'),
        ink: zone.querySelector('.ink'),
        pbody: el.querySelector('.puff-body'),
        pspikes: el.querySelector('.puff-spikes'),
        jaw: el.querySelector('.a-jaw'),
        bulb: el.querySelector('.a-bulb'),
        jb: el.querySelectorAll('.n-bub'),
        duckEl: el.querySelector('.hc-out'),
        eb: el.querySelector('.eel-b'),
        ebub: el.querySelectorAll('.eel-bub'),
        peekT: 1.2 + Math.random() * 2.5, eelAnim: null, duckT: 0,
        flickT: 3 + Math.random() * 5, lockFace: 0,
        splashes: []
      };
      if (k.dolphin && zone.parentElement) {
        const layer = zone.parentElement.querySelector('.splash-layer');
        c.splashes = layer ? layer.querySelectorAll('.splash') : [];
      }
      if (k.school) {
        const id = el.getAttribute('data-group') || 'school';
        const g = groups[id] || (groups[id] = { members: [], gx: 0, gy: 0, cx: 0, cy: 0, cruise: k.speed[0], spread: 0, fleeT: 0, ready: false });
        c.group = g;
        c.ox = parseFloat(el.getAttribute('data-ox')) || 0;
        c.oy = parseFloat(el.getAttribute('data-oy')) || 0;
        c.mul = 0.92 + Math.random() * 0.16;
        g.members.push(c);
      }
      list.push(c);
    }
    if (!list.length) return false;
    this.sea = list;
    this.seaGroups = Object.keys(groups).map((id) => groups[id]);
    this.seaMeasure();
    this.watch();
    return true;
  }

  seaMeasure() {
    const list = this.sea || [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      c.zw = c.zone.clientWidth;
      c.zh = c.zone.clientHeight;
      c.w = c.el.offsetWidth;
      c.h = c.el.offsetHeight;
      c.hx = c.home.offsetLeft;
      c.hy = c.home.offsetTop;
      c.mx = Math.max(0, c.zw - c.w);
      c.my = Math.max(0, c.zh - c.h);
      if (!c.zw || !c.w) continue;
      if (!c.ready) {
        c.ready = true;
        c.x = Math.min(c.hx, c.mx);
        c.y = Math.min(c.hy, c.my);
        this.seaPick(c);
        c.face = c.gx >= c.x ? 1 : -1;
        c.fs = c.face;
        c.vx = c.face * c.cruise * 0.4;
      }
      c.x = Math.max(0, Math.min(c.mx, c.x));
      c.y = Math.max(0, Math.min(c.my, c.y));
      if (c.k.line) c.gy = c.y;
    }
  }

  seaPick(c) {
    const k = c.k;
    const far = Math.min(k.far, 0.6 * Math.max(c.mx, c.my));
    let gx = c.x;
    let gy = c.y;
    for (let n = 0; n < 10; n++) {
      gx = k.jelly ? c.x + (Math.random() - 0.5) * 160 : Math.random() * c.mx;
      gx = Math.max(0, Math.min(c.mx, gx));
      if (k.line) gy = c.y;
      else if (k.dolphin) gy = k.surf + 24 + Math.random() * 46;
      else if (k.vert) {
        // mostly level swimming: climbs and dives stay gentle
        const span = Math.min(c.my, Math.abs(gx - c.x) * k.vert + 50);
        gy = c.y + (Math.random() * 2 - 1) * span;
      } else gy = Math.random() * c.my;
      gy = Math.max(0, Math.min(c.my, gy));
      if (Math.hypot(gx - c.x, gy - c.y) >= far) break;
    }
    c.gx = gx;
    c.gy = gy;
    c.cruise = k.speed[0] + Math.random() * (k.speed[1] - k.speed[0]);
  }

  // schools: one destination per school, re-picked as the school arrives
  seaSchools(dt) {
    const gs = this.seaGroups || [];
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      if (g.members[0] && !g.members[0].on) continue;
      let n = 0;
      let cx = 0;
      let cy = 0;
      for (let j = 0; j < g.members.length; j++) {
        const m = g.members[j];
        if (!m.ready) continue;
        cx += m.x;
        cy += m.y;
        n++;
      }
      if (!n) continue;
      g.cx = cx / n;
      g.cy = cy / n;
      if (g.spread > 0) g.spread = Math.max(0, g.spread - dt / 1.8);
      if (!g.ready || Math.hypot(g.gx - g.cx, g.gy - g.cy) < 36) this.seaGroupPick(g);
    }
  }

  seaGroupPick(g) {
    const c = g.members[0];
    if (!c || !c.ready) return;
    const lo = Math.min(70, c.mx / 2);
    const hi = Math.max(lo, c.mx - 70);
    const loY = Math.min(26, c.my / 2);
    const hiY = Math.max(loY, c.my - 26);
    const far = Math.min(c.k.far, 0.6 * c.mx);
    let gx = g.cx;
    let gy = g.cy;
    for (let n = 0; n < 10; n++) {
      gx = lo + Math.random() * (hi - lo);
      gy = loY + Math.random() * (hiY - loY);
      if (Math.hypot(gx - g.cx, gy - g.cy) >= far) break;
    }
    g.gx = gx;
    g.gy = gy;
    g.ready = true;
    g.cruise = c.k.speed[0] + Math.random() * (c.k.speed[1] - c.k.speed[0]);
  }

  seaScatter(g, now) {
    if (now < g.fleeT) return;
    g.fleeT = now + 1200;
    g.spread = 1;
    const c = g.members[0];
    const r = c.zone.__r || c.zone.getBoundingClientRect();
    const dx = r.left + g.cx - this.tx;
    const dy = r.top + g.cy - this.ty;
    const d = Math.hypot(dx, dy) || 1;
    g.gx = Math.max(Math.min(70, c.mx / 2), Math.min(Math.max(c.mx - 70, c.mx / 2), g.cx + (dx / d) * 280));
    g.gy = Math.max(Math.min(26, c.my / 2), Math.min(Math.max(c.my - 26, c.my / 2), g.cy + (dy / d) * 120));
    for (let i = 0; i < g.members.length; i++) g.members[i].boost = 1;
  }

  seaCursor(c, k, now) {
    const r = c.zone.__r || c.zone.getBoundingClientRect();
    if (r.bottom < -100 || r.top > (window.innerHeight || 0) + 100) return;
    const cx = r.left + c.x + c.w / 2;
    const cy = r.top + c.y + c.h / 2;
    const dx = cx - this.tx;
    const dy = cy - this.ty;
    const d = Math.hypot(dx, dy);
    if (k.school) {
      if (d < k.shy) this.seaScatter(c.group, now);
      return;
    }
    if (k.shy && d < k.shy && now > c.fleeT) {
      if (k.duck) {
        c.fleeT = now + 3400;
        this.seaDuck(c);
        return;
      }
      if (k.flick) {
        c.fleeT = now + 1300;
        this.seaFlick(c, now);
        return;
      }
      c.fleeT = now + 900;
      const ux = d > 1 ? dx / d : (Math.random() < 0.5 ? -1 : 1);
      const uy = d > 1 ? dy / d : 0;
      c.gx = Math.max(0, Math.min(c.mx, c.x + ux * 220));
      c.gy = k.line ? c.y : Math.max(0, Math.min(c.my, c.y + uy * 160));
      c.idle = 0;
      c.boost = 1;
      if (c.ink) this.seaInk(c, now);
    }
    if (k.puff && d < k.near) {
      // puffs up, and backs off a little
      this.seaPuff(c, now);
      if (now > c.fleeT) {
        c.fleeT = now + 1500;
        c.gx = Math.max(0, Math.min(c.mx, c.x + (dx >= 0 ? 1 : -1) * 90));
        c.idle = 0;
      }
    }
    if (k.angler) {
      // drawn to the cursor like prey to its light; snaps when it gets close
      const inside = this.tx > r.left - 80 && this.tx < r.right + 80 && this.ty > r.top - 60 && this.ty < r.bottom + 60;
      if (inside && now > c.curT) {
        c.curT = now + 2200;
        c.gx = Math.max(0, Math.min(c.mx, this.tx - r.left - c.w * 0.8));
        c.gy = Math.max(0, Math.min(c.my, this.ty - r.top - c.h * 0.2));
        c.idle = 0;
      }
      if (d < k.near) this.seaSnap(c, now);
    }
    if (k.dolphin && d < k.near && c.mode === 'swim' && now > c.hiT) {
      // say hi: leap as soon as there is room
      c.hiT = now + 4500;
      c.leapT = Math.min(c.leapT, 0.15);
    }
    if (k.whale) {
      if (d < 210 && now > c.hiT) {
        c.hiT = now + 7000;
        c.spoutT = 9 + Math.random() * 6;
        this.seaSpout(c);
      }
      const near = this.tx > r.left && this.tx < r.right && this.ty > r.top - 320 && this.ty < r.bottom + 20;
      if (near && now > c.curT) {
        c.curT = now + 4500 + Math.random() * 3000;
        c.gx = Math.max(0, Math.min(c.mx, this.tx - r.left - c.w / 2));
        c.gy = Math.max(0, Math.min(c.my, this.ty - r.top - c.h / 2));
        c.idle = 0;
        c.cruise = k.speed[1];
      }
    }
  }

  seaStep(c, dt, now, ptrOn) {
    if (!c.ready) return;
    const k = c.k;
    if (k.still) {
      this.seaEel(c, k, dt, now, ptrOn);
      return;
    }
    if (ptrOn && (k.shy || k.near || k.whale)) this.seaCursor(c, k, now);
    if (c.boost > 0) c.boost = Math.max(0, c.boost - dt / 1.6);
    if (k.flick) {
      c.flickT -= dt;
      if (c.flickT <= 0) {
        c.flickT = 5 + Math.random() * 6;
        if (!c.idle) this.seaFlick(c, now);
      }
    }
    if (k.dolphin && c.mode !== 'swim') this.seaAir(c, dt);
    else this.seaSwim(c, k, dt, now);

    if (c.x < 0) {
      c.x = 0;
      if (c.vx < 0) c.vx = 0;
    } else if (c.x > c.mx) {
      c.x = c.mx;
      if (c.vx > 0) c.vx = 0;
    }
    if (c.y < 0) {
      c.y = 0;
      if (c.vy < 0) c.vy = 0;
    } else if (c.y > c.my) {
      c.y = c.my;
      if (c.vy > 0) c.vy = 0;
    }
    this.seaDraw(c, k, dt, now);

    if (k.whale) {
      c.spoutT -= dt;
      if (c.spoutT <= 0) {
        c.spoutT = 8 + Math.random() * 7;
        this.seaSpout(c);
      }
    }
    if (k.puff) {
      c.autoPuff -= dt;
      if (c.autoPuff <= 0) {
        c.autoPuff = 16 + Math.random() * 14;
        this.seaPuff(c, now);
      }
    }
    if (c.legs) {
      // the crab's legs only patter while it walks
      const rate = Math.abs(c.vx) > 3 ? (c.boost > 0.3 ? 2 : 1) : 0;
      if (rate !== c.rate) {
        c.rate = rate;
        const an = c.legs.getAnimations ? c.legs.getAnimations() : [];
        for (let i = 0; i < an.length; i++) an[i].playbackRate = rate;
      }
    }
  }

  seaSwim(c, k, dt, now) {
    let sp = c.cruise * (1 + 2.4 * c.boost);
    const acc = k.acc * (1 + 3 * c.boost);
    if (k.puff && now < c.puffUntil) sp *= 0.3;
    let ax;
    let ay;
    if (k.school) {
      // keep a loose place in the school; the school spreads out when startled
      const g = c.group;
      const s = 1 + 2.4 * g.spread;
      const tx = Math.max(0, Math.min(c.mx, g.gx + c.ox * s));
      const ty = Math.max(0, Math.min(c.my, g.gy + c.oy * s + Math.sin(now / 900 + c.phase) * 5));
      const dx = tx - c.x;
      const dy = ty - c.y;
      const dist = Math.hypot(dx, dy);
      const want = g.cruise * c.mul * (1 + 2.4 * c.boost) * Math.min(1.7, dist / k.slow);
      const n = dist || 1;
      ax = (dx / n) * want - c.vx;
      ay = (dy / n) * want - c.vy;
    } else if (c.idle > 0) {
      // resting: drift to a stop, keep bobbing
      c.idle -= dt;
      ax = -c.vx;
      ay = -c.vy;
      if (c.idle <= 0) this.seaPick(c);
    } else {
      const dx = c.gx - c.x;
      const dy = c.gy - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < k.slow * 0.35) {
        if (!c.boost && Math.random() < k.rest) c.idle = k.restT[0] + Math.random() * (k.restT[1] - k.restT[0]);
        else this.seaPick(c);
      }
      const want = sp * Math.min(1, dist / k.slow);
      const n = dist || 1;
      ax = (dx / n) * want - c.vx;
      ay = (dy / n) * want - c.vy;
      if (k.jet) {
        c.jetT -= dt;
        if (c.jetT <= 0 && dist > 20) {
          c.jetT = 2.4 + Math.random() * 1.6;
          c.vx += (dx / n) * k.jet;
          c.vy += (dy / n) * k.jet;
          c.sq = 1;
          if (k.jetBub) this.seaJetBub(c);
        }
      }
    }
    // steer with a capped acceleration, so every turn is a smooth curve
    const am = Math.hypot(ax, ay);
    const lim = acc * dt;
    if (am > lim) {
      ax *= lim / am;
      ay *= lim / am;
    }
    c.vx += ax;
    c.vy += ay;
    if (k.line) c.vy = 0;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    if (k.dolphin) {
      // now and then, with room ahead, leap clear of the surface
      c.leapT -= dt;
      if (c.leapT <= 0) {
        const dir = c.vx >= 0 ? 1 : -1;
        const room = dir > 0 ? c.mx - c.x : c.x;
        if (Math.abs(c.vx) > 14 && room > 340) {
          const cy = c.y + c.h / 2;
          const apex = k.surf - (60 + Math.random() * 26);
          c.mode = 'air';
          c.vy = -Math.sqrt(2 * 560 * Math.max(40, cy - apex));
          c.vx = dir * (150 + Math.random() * 25);
          c.prevCy = cy;
          c.leapT = 5 + Math.random() * 6;
        } else c.leapT = 0.7;
      }
    }
  }

  // the dolphin out of the water: a ballistic arc, a splash on the way out and back in
  seaAir(c, dt) {
    const surf = c.k.surf;
    if (c.mode === 'air') {
      c.vy += 560 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      const cy = c.y + c.h / 2;
      if (c.prevCy >= surf && cy < surf) this.seaSplash(c, 1);
      if (c.prevCy <= surf && cy > surf) this.seaSplash(c, 1.35);
      c.prevCy = cy;
      if (c.vy > 0 && cy > surf + 34) c.mode = 'dive';
    } else {
      // back under: the water brakes the dive, then it swims on
      c.vy *= Math.exp(-9 * dt);
      c.vx *= Math.exp(-0.8 * dt);
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (Math.abs(c.vy) < 30) {
        c.mode = 'swim';
        this.seaPick(c);
      }
    }
  }

  seaDraw(c, k, dt, now) {
    const airborne = k.dolphin && c.mode !== 'swim';
    let t = 'translate(' + (c.x - c.hx).toFixed(1) + 'px,' + (c.y - c.hy).toFixed(1) + 'px)';
    if (k.art) {
      // face the way it swims; the turn plays like a quick roll, nose pitched to the climb
      const th = Math.max(2.5, c.cruise * 0.15);
      if (!(c.lockFace > now)) {
        if (c.vx > th) c.face = 1;
        else if (c.vx < -th) c.face = -1;
      }
      const step = dt * k.flip;
      c.fs = c.fs < c.face ? Math.min(c.face, c.fs + step) : Math.max(c.face, c.fs - step);
      const s = Math.sin(c.fs * 1.5708);
      const lim = airborne ? 58 : k.tilt;
      const p = Math.hypot(c.vx, c.vy) > 2 ? Math.atan2(c.vy, Math.abs(c.vx)) * 57.3 : 0;
      c.pitch += (Math.max(-lim, Math.min(lim, p)) - c.pitch) * Math.min(1, dt * (airborne ? 12 : 3));
      t += ' rotate(' + (c.pitch * s).toFixed(2) + 'deg) scale(' + (s * k.art).toFixed(3) + ',1)';
    } else if (k.roll) {
      c.rot += ((c.vx * dt) / Math.max(8, c.w * 0.45)) * 57.3;
      t += ' rotate(' + c.rot.toFixed(1) + 'deg)';
    } else if (k.lean) {
      const L = k.lean;
      c.lean += (Math.max(-L, Math.min(L, (c.vx / k.speed[1]) * L)) - c.lean) * Math.min(1, dt * 3);
      t += ' rotate(' + c.lean.toFixed(2) + 'deg)';
    }
    if (k.jet && c.sq > 0) {
      c.sq = Math.max(0, c.sq - dt * 2.2);
      t += ' scale(' + (1 - 0.08 * c.sq).toFixed(3) + ',' + (1 + 0.1 * c.sq).toFixed(3) + ')';
    }
    c.el.style.transform = t;
  }

  // the nautilus puffs a few bubbles out of its funnel on each push (local -x is always behind it)
  seaJetBub(c) {
    const bs = c.jb || [];
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (!b.animate) continue;
      b.animate([
        { opacity: 0, transform: 'translate(0px,0px) scale(.5)' },
        { opacity: 0.9, transform: 'translate(' + (-5 - i * 4) + 'px,' + (-3 - i * 3) + 'px) scale(1)', offset: 0.3 },
        { opacity: 0, transform: 'translate(' + (-15 - i * 8) + 'px,' + (-16 - i * 7) + 'px) scale(1.15)' }
      ], { duration: 950 + i * 160, delay: i * 70, easing: 'ease-out' });
    }
  }

  // the hermit crab pulls everything into its shell, waits, then peeks out again
  seaDuck(c) {
    c.idle = 2.4;
    c.vx = 0;
    c.vy = 0;
    c.boost = 0;
    const el = c.duckEl;
    if (el && el.animate) {
      el.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(.12)', offset: 0.1 },
        { transform: 'scale(.12)', offset: 0.7 },
        { transform: 'scale(1.06)', offset: 0.88 },
        { transform: 'scale(1)' }
      ], { duration: 2600, easing: 'ease-out' });
    }
  }

  // a shrimp's escape: a quick flick backwards, still facing forwards, then it turns and swims on
  seaFlick(c, now) {
    const back = -(c.face || 1);
    c.lockFace = now + 800;
    c.vx = back * c.k.flick;
    c.vy = (Math.random() - 0.5) * 46;
    c.gx = Math.max(0, Math.min(c.mx, c.x + back * (110 + Math.random() * 80)));
    c.gy = Math.max(0, Math.min(c.my, c.y + (Math.random() - 0.5) * 60));
    c.idle = 0;
    c.boost = 1;
  }

  // the moray: peeks out of its den on its own clock, looks around, sinks back; ducks fast if the cursor comes close
  seaEel(c, k, dt, now, ptrOn) {
    const eb = c.eb;
    if (!eb || !eb.animate) return;
    if (c.eelAnim && ptrOn && c.zone.__r && now > c.duckT) {
      const r = c.zone.__r;
      const d = Math.hypot(r.left + c.hx + c.w * 0.5 - this.tx, r.top + c.hy + c.h * 0.3 - this.ty);
      if (d < k.near) {
        const cur = getComputedStyle(eb).transform;
        c.eelAnim.cancel();
        c.duckT = now + 900;
        c.peekT = 3.5 + Math.random() * 2.5;
        c.eelAnim = eb.animate([{ transform: !cur || cur === 'none' ? 'translateY(0px)' : cur }, { transform: 'translateY(58px)' }],
          { duration: 260, easing: 'cubic-bezier(.4,0,.9,.6)' });
        c.eelAnim.onfinish = () => { c.eelAnim = null; };
        return;
      }
    }
    if (c.eelAnim) return;
    c.peekT -= dt;
    if (c.peekT > 0) return;
    c.peekT = 4 + Math.random() * 5;
    const dur = 5200 + Math.random() * 1600;
    c.eelAnim = eb.animate([
      { transform: 'translateY(58px)' },
      { transform: 'translateY(2px) rotate(-3deg)', offset: 0.16 },
      { transform: 'translateY(-2px) rotate(6deg)', offset: 0.36 },
      { transform: 'translateY(0px) rotate(-5deg)', offset: 0.56 },
      { transform: 'translateY(1px) rotate(2deg)', offset: 0.76 },
      { transform: 'translateY(58px)' }
    ], { duration: dur, easing: 'ease-in-out' });
    c.eelAnim.onfinish = () => { c.eelAnim = null; };
    const bs = c.ebub || [];
    for (let i = 0; i < bs.length; i++) {
      if (!bs[i].animate) continue;
      bs[i].animate([
        { opacity: 0, transform: 'translate(0px,0px) scale(.5)' },
        { opacity: 0.9, transform: 'translate(2px,-8px) scale(1)', offset: 0.3 },
        { opacity: 0, transform: 'translate(6px,-30px) scale(1.15)' }
      ], { duration: 1500, delay: dur * 0.3 + i * 260, easing: 'ease-out' });
    }
  }

  seaSpout(c) {
    const s = c.spout;
    if (s && s.animate) {
      s.animate([
        { opacity: 0, transform: 'scale(.3,.05)' },
        { opacity: 1, transform: 'scale(1,1)', offset: 0.28 },
        { opacity: 1, transform: 'scale(1.04,1.06)', offset: 0.7 },
        { opacity: 0, transform: 'scale(1.08,1.12)' }
      ], { duration: 2100, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
    const drops = c.drops || [];
    for (let i = 0; i < drops.length; i++) {
      const el = drops[i];
      if (!el.animate) continue;
      const dx = (i - (drops.length - 1) / 2) * 10;
      el.animate([
        { opacity: 0, transform: 'translate(0px,16px) scale(.4)' },
        { opacity: 1, transform: 'translate(' + (dx * 0.4).toFixed(1) + 'px,-6px) scale(1)', offset: 0.35 },
        { opacity: 0, transform: 'translate(' + dx.toFixed(1) + 'px,24px) scale(.7)' }
      ], { duration: 1800, delay: 260 + i * 70, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'backwards' });
    }
  }

  seaSplash(c, size) {
    const list = c.splashes || [];
    if (!list.length) return;
    const sp = list[c.splashI % list.length];
    c.splashI++;
    if (!sp || !sp.animate) return;
    const at = 'translate(' + (c.x + c.w / 2 - 30).toFixed(1) + 'px,' + (c.k.surf - 40).toFixed(1) + 'px) scale(' + size + ')';
    sp.animate([{ opacity: 1, transform: at }, { opacity: 1, transform: at, offset: 0.8 }, { opacity: 0, transform: at }], { duration: 1000 });
    const drops = sp.querySelectorAll('.sdrop');
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d.animate) continue;
      const dx = (i - (drops.length - 1) / 2) * 8 + (Math.random() - 0.5) * 6;
      const hy = 22 + Math.random() * 18 + (i === (drops.length - 1) / 2 ? 14 : 0);
      d.animate([
        { opacity: 1, transform: 'translate(0px,0px) scale(.4)' },
        { opacity: 1, transform: 'translate(' + (dx * 0.55).toFixed(1) + 'px,' + (-hy).toFixed(1) + 'px) scale(1)', offset: 0.42 },
        { opacity: 0, transform: 'translate(' + dx.toFixed(1) + 'px,8px) scale(.5)' }
      ], { duration: 820, easing: 'cubic-bezier(.25,.6,.4,1)' });
    }
    const rp = sp.querySelector('.ripple');
    if (rp && rp.animate) rp.animate([{ opacity: 0.9, transform: 'scale(.2,.3)' }, { opacity: 0, transform: 'scale(1.5,1.2)' }], { duration: 1000, easing: 'ease-out' });
  }

  seaPuff(c, now) {
    if (now < c.puffUntil + 800) return;
    c.puffUntil = now + 2800;
    const ease = 'cubic-bezier(.3,.7,.3,1)';
    if (c.pbody && c.pbody.animate) {
      c.pbody.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.42)', offset: 0.12 },
        { transform: 'scale(1.36)', offset: 0.84 },
        { transform: 'scale(1)' }
      ], { duration: 2800, easing: ease });
    }
    if (c.pspikes && c.pspikes.animate) {
      c.pspikes.animate([
        { opacity: 0, transform: 'scale(.55)' },
        { opacity: 1, transform: 'scale(1.16)', offset: 0.12 },
        { opacity: 1, transform: 'scale(1.1)', offset: 0.84 },
        { opacity: 0, transform: 'scale(.55)' }
      ], { duration: 2800, easing: ease });
    }
  }

  seaSnap(c, now) {
    if (now < c.snapT) return;
    c.snapT = now + 2600;
    if (c.jaw && c.jaw.animate) {
      c.jaw.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(20deg)', offset: 0.22 },
        { transform: 'rotate(20deg)', offset: 0.5 },
        { transform: 'rotate(0deg)' }
      ], { duration: 1200, easing: 'cubic-bezier(.3,.7,.3,1)' });
    }
    if (c.bulb && c.bulb.animate) {
      c.bulb.animate([{ transform: 'scale(1)' }, { transform: 'scale(2)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 1200, easing: 'ease-out' });
    }
  }

  seaInk(c, now) {
    const ink = c.ink;
    if (!ink || !ink.animate || now < c.inkT) return;
    c.inkT = now + 2600;
    const x = c.x + c.w / 2 - 17;
    const y = c.y + c.h * 0.5 - 17;
    const at = (yy, s) => 'translate(' + x.toFixed(1) + 'px,' + yy.toFixed(1) + 'px) scale(' + s + ')';
    ink.animate([
      { opacity: 0.85, transform: at(y, 0.3) },
      { opacity: 0.55, transform: at(y + 4, 1.15), offset: 0.35 },
      { opacity: 0, transform: at(y + 16, 1.5) }
    ], { duration: 1700, easing: 'ease-out' });
  }

  // Scroll effects run only when the page genuinely scrolls in a normal
  // window. In a frame as tall as the page (a design preview), nothing
  // scrolls, so everything renders in its finished state.
  checkMotion() {
    let on = false;
    try {
      const supports = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()'));
      const el = document.scrollingElement || document.documentElement;
      const room = el.scrollHeight - window.innerHeight;
      on = supports && !this.reduce && window.innerHeight < 2400 && room > 1200;
    } catch {
      on = false;
    }
    const cur = !!(this.state && this.state.motion);
    if (on !== cur) this.setState({ motion: on });
  }
}
