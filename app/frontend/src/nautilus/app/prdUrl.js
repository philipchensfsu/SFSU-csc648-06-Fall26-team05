// URLs for the two PRD pages that leave the sidebar: the details page at
// /prds/<id> and the editor at /prds/<id>/edit, so the browser's Back and
// Forward buttons move between them and the workspace (issue #200).
// The workspace pages share the sidebar and stay at /dashboard.
import { useCallback, useEffect, useRef } from "react";
import links from "../links";

export function prdPath(screen, prdId) {
  const base = `/prds/${encodeURIComponent(prdId)}`;
  return screen === "editor" ? `${base}/edit` : base;
}

// { screen: "details" | "editor", id } for a PRD page's URL, else null.
export function parsePrdPath(path) {
  const match = /^\/prds\/([^/]+)(\/edit)?\/?$/.exec(path ?? "");
  return match ? { screen: match[2] ? "editor" : "details", id: decodeURIComponent(match[1]) } : null;
}

const hasUrl = (screen) => screen === "editor" || screen === "details";

// How many PRD pages the app has pushed since the workspace, kept on each
// history entry so leaving through the app can step back over all of them.
export const depthOf = (state) => state?.nautilusPrdDepth ?? 0;

// Keeps the address bar in step with the PRD pages:
// - opening one pushes its URL;
// - leaving them for anything else (the dashboard, a flow) steps back over
//   those entries, so none are left behind;
// - Back and Forward show what the URL says (followUrl). On the editor, Back
//   is the editor's to handle, since it may have unsaved changes: it calls
//   followUrl once it's fine to leave.
// - a page loaded at a PRD URL opens it once the list has loaded.
// open.editor(id) / open.details(id) reject when the PRD can't be opened;
// the URL then goes to /dashboard and onOpenFailed(error) is told.
export function usePrdUrl({ screen, activePrdId, prdsLoaded, prdsError, open, showWorkspace, onOpenFailed }) {
  // The PRD page in the URL the page was loaded at, until it has been opened.
  const linked = useRef(parsePrdPath(window.location.pathname));
  const linkStarted = useRef(false);
  const skipPop = useRef(false);
  // What the callbacks read, kept current after each render.
  const latest = useRef({});
  useEffect(() => {
    latest.current = { screen, activePrdId, open, showWorkspace, onOpenFailed };
  });

  const openTarget = useCallback((target) => {
    const now = latest.current;
    return now.open[target.screen](target.id).catch((error) => {
      // replaceState doesn't fire popstate.
      window.history.replaceState(null, "", links.dashboard);
      now.showWorkspace();
      now.onOpenFailed(error);
    });
  }, []);

  // Shows what the URL says: a PRD page, or the workspace.
  const followUrl = useCallback(() => {
    const target = parsePrdPath(window.location.pathname);
    const now = latest.current;
    if (!target) {
      if (hasUrl(now.screen)) now.showWorkspace();
    } else if (target.screen !== now.screen || target.id !== now.activePrdId) {
      openTarget(target);
    }
  }, [openTarget]);

  // A page loaded at a PRD URL: open it once the list is in, or give up on it
  // if the list couldn't load. The URL is left alone until then.
  useEffect(() => {
    const target = linked.current;
    if (!target || linkStarted.current || !(prdsLoaded || prdsError)) return;
    linkStarted.current = true;
    if (prdsLoaded) {
      openTarget(target).finally(() => {
        linked.current = null;
      });
    } else {
      linked.current = null;
      window.history.replaceState(null, "", links.dashboard);
    }
  }, [prdsLoaded, prdsError, openTarget]);

  useEffect(() => {
    if (linked.current) return;
    const here = window.location.pathname;
    if (hasUrl(screen) && activePrdId) {
      const target = prdPath(screen, activePrdId);
      if (here === target) return;
      const depth = depthOf(window.history.state) + 1;
      window.history.pushState({ nautilusPrdDepth: depth }, "", target);
    } else if (parsePrdPath(here)) {
      const depth = depthOf(window.history.state);
      if (depth > 0) {
        skipPop.current = true;
        window.history.go(-depth);
      } else {
        // Loaded at this URL, so stepping back would leave the app.
        window.history.replaceState(null, "", links.dashboard);
      }
    }
  }, [screen, activePrdId]);

  useEffect(() => {
    function onPopState() {
      if (skipPop.current) {
        skipPop.current = false;
        // Stepped back to the PRD URL the page was loaded at.
        if (parsePrdPath(window.location.pathname)) {
          window.history.replaceState(null, "", links.dashboard);
        }
        return;
      }
      if (latest.current.screen !== "editor") followUrl();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [followUrl]);

  return followUrl;
}
