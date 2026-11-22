import { useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { POLL_MS, formatRemaining } from "./discord";
import { formatDate } from "./format";
import { IconCheck, IconComment } from "./icons";
import { Alert } from "./ui";

const PILLS = {
  loading: { tone: "muted", label: "Checking…" },
  "load-error": { tone: "muted", label: "Unknown" },
  intro: { tone: "muted", label: "Not connected" },
  waiting: { tone: "warn", label: "Waiting for /link" },
  expired: { tone: "warn", label: "Code expired" },
  linked: { tone: "ok", label: "Connected" },
  "confirm-unlink": { tone: "ok", label: "Connected" },
};

function Cmd({ children }) {
  return <code className="nd-discord-cmd">{children}</code>;
}

// Connect Discord (feature 04), on the Profile page: link this Nautilus
// account to a Discord account with a one-time code, or unlink it.
//
// Steps: checking the link, not linked, waiting for /link with a code, the
// code ran out, or linked (with Unlink to confirm).
export default function DiscordConnection() {
  const [step, setStep] = useState("loading");
  const [link, setLink] = useState(null); // { linked_at }
  const [code, setCode] = useState(null); // { code, expiresAt }
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const box = useRef(null);
  // Set by a click that changes the step, so focus follows to the new step's
  // main control instead of falling back to the page.
  const moveFocus = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    box.current?.querySelector("[data-focus]")?.focus();
  }, [step]);

  function go(next) {
    moveFocus.current = true;
    setStep(next);
  }

  // Is this account linked already?
  useEffect(() => {
    let current = true;
    api
      .getDiscordLink()
      .then((status) => {
        if (!current) return;
        setLink(status?.linked ? status : null);
        setStep(status?.linked ? "linked" : "intro");
      })
      .catch((cause) => {
        if (!current) return;
        setError(cause?.message || "Couldn’t check your Discord link.");
        setStep("load-error");
      });
    return () => {
      current = false;
    };
  }, [attempt]);

  // While a code is out: the countdown, and a check every few seconds for the
  // link the bot makes. Both stop once it's linked, the code runs out or the
  // page closes.
  useEffect(() => {
    if (step !== "waiting") return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      api
        .getDiscordLink()
        .then((status) => {
          if (mounted.current && status?.linked) {
            setLink(status);
            setStep("linked");
          }
        })
        // A failed check is tried again on the next one.
        .catch(() => {});
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [step]);

  const remaining = code ? code.expiresAt - now : 0;
  if (step === "waiting" && remaining <= 0) {
    setStep("expired");
    setNote("");
  }

  async function getCode() {
    setBusy(true);
    setError("");
    setNote("");
    setCopied(false);
    try {
      const created = await api.createDiscordLinkCode();
      if (!mounted.current) return;
      setCode({ code: created.code, expiresAt: Date.parse(created.expires_at) });
      setNow(Date.now());
      go("waiting");
    } catch (cause) {
      if (mounted.current) setError(cause?.message || "Couldn’t get a code. Try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  // "I've run it": check right away instead of waiting for the next check.
  async function checkNow() {
    setBusy(true);
    setNote("");
    try {
      const status = await api.getDiscordLink();
      if (!mounted.current) return;
      if (status?.linked) {
        setLink(status);
        go("linked");
      } else {
        setNote("Not linked yet. Run the command in Discord, then try again.");
      }
    } catch (cause) {
      if (mounted.current) setNote(cause?.message || "Couldn’t check. Try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function cancel() {
    setCode(null);
    setNote("");
    setError("");
    go("intro");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code.code);
      if (mounted.current) setCopied(true);
    } catch {
      // No clipboard (an older browser or no permission): the code is on screen to copy by hand.
    }
  }

  async function unlink() {
    setBusy(true);
    setError("");
    try {
      await api.unlinkDiscord();
      if (!mounted.current) return;
      setLink(null);
      setCode(null);
      go("intro");
    } catch (cause) {
      if (mounted.current) setError(cause?.message || "Couldn’t unlink. Try again.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const pill = PILLS[step];
  const linked = step === "linked" || step === "confirm-unlink";

  let summary = "Ask the Nautilus bot about your PRDs, inbox and discussion summaries from the class Discord server.";
  if (linked) {
    summary = link?.linked_at ? `Since ${formatDate(link.linked_at)}. ` : "";
  }

  let action = null;
  if (step === "intro") {
    action = (
      <button type="button" className="nw-btn nw-btn-primary" onClick={getCode} disabled={busy} data-focus>
        {busy ? "Getting a code…" : "Connect"}
      </button>
    );
  } else if (step === "linked") {
    action = (
      <button type="button" className="nw-btn nw-btn-danger-outline" onClick={() => go("confirm-unlink")} data-focus>
        Unlink
      </button>
    );
  }

  return (
    <div className="np-app" ref={box}>
      <div className="np-app-row">
        <span className="np-app-icon" aria-hidden="true">
          <IconComment size={22} />
        </span>
        <div className="np-app-text">
          <div className="np-app-name">
            <h3>Discord</h3>
            <span className={`np-pill np-pill-${pill.tone}`} role="status">
              {pill.tone === "ok" ? <IconCheck size={12} strokeWidth={2.4} /> : null}
              {pill.label}
            </span>
          </div>
          <p className="np-app-desc">
            {summary}
            {linked ? (
              <>
                Try <Cmd>/prds</Cmd>, <Cmd>/inbox</Cmd> or <Cmd>/summary</Cmd> in the class Discord server. Only you see
                the bot’s answers.
              </>
            ) : null}
          </p>
        </div>
        {action}
      </div>

      {step === "load-error" ? (
        <Alert
          onRetry={() => {
            setError("");
            setStep("loading");
            setAttempt((value) => value + 1);
          }}
        >
          {error}
        </Alert>
      ) : null}

      {(step === "intro" || linked) && error ? <Alert onDismiss={() => setError("")}>{error}</Alert> : null}

      {step === "confirm-unlink" ? (
        <div className="nd-discord-confirm" role="group" aria-label="Unlink Discord?">
          <p className="nw-modal-text">Unlink Discord? The bot stops answering for you until you connect again.</p>
          <div className="np-actions">
            <button type="button" className="nw-btn nw-btn-secondary" onClick={() => go("linked")} disabled={busy} data-focus>
              Keep it
            </button>
            <button type="button" className="nw-btn nw-btn-danger" onClick={unlink} disabled={busy}>
              {busy ? "Unlinking…" : "Unlink"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "waiting" ? (
        <div className="np-app-body">
          <p className="np-app-step">
            In the class Discord server, type <Cmd>/link</Cmd> and paste this code:
          </p>
          <div className="nd-discord-code">
            <code aria-label="Your code">{code.code}</code>
            <button type="button" className="nw-btn nw-btn-secondary nw-btn-sm" onClick={copy} data-focus>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="np-app-foot">
            <p className="nd-discord-wait">
              <span>Waiting for Discord…</span>
              <span className="nd-discord-timer" aria-label={`Code expires in ${formatRemaining(remaining)}`}>
                {formatRemaining(remaining)}
              </span>
            </p>
            <div className="np-actions">
              <button type="button" className="nw-btn nw-btn-secondary" onClick={cancel} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="nw-btn nw-btn-primary" onClick={checkNow} disabled={busy}>
                {busy ? "Checking…" : "I’ve run it"}
              </button>
            </div>
          </div>
          {note ? <p className="nw-hint nd-discord-note">{note}</p> : null}
          <p className="nw-hint">The code works once and lasts 10 minutes. This section updates by itself.</p>
        </div>
      ) : null}

      {step === "expired" ? (
        <div className="np-app-body">
          <div className="nd-discord-code is-expired">
            <code>{code.code}</code>
          </div>
          <Alert>This code has expired. Get a new one to try again.</Alert>
          {error ? <Alert onDismiss={() => setError("")}>{error}</Alert> : null}
          <div className="np-actions">
            <button type="button" className="nw-btn nw-btn-secondary" onClick={cancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="nw-btn nw-btn-primary" onClick={getCode} disabled={busy} data-focus>
              {busy ? "Getting a code…" : "Get a new code"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
