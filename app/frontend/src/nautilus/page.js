// Small helpers the pages use: fonts, and links that a client-side router can take.

export const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap';

// Geist, Geist Mono and Instrument Serif, added once per document (skipped when index.html already links them).
export function ensureFonts() {
  if (typeof document === 'undefined' || document.querySelector('link[href*="family=Geist"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONTS_URL;
  document.head.appendChild(link);
}

// Put on a page's root as onClick: links to other app pages ("/", "/signin", "/signup") go to onNavigate(path)
// when it is given, so the app's router can take them; without it they are ordinary links.
// "#…" links, external links and modified clicks (new tab etc.) are left to the browser.
export function followLink(e, onNavigate) {
  if (!onNavigate || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a || (a.target && a.target !== '_self')) return;
  const href = a.getAttribute('href');
  if (!href || href[0] !== '/' || href[1] === '/') return;
  e.preventDefault();
  onNavigate(href);
}
