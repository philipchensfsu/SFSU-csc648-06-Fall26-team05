import { useEffect, useRef, useState } from "react";
import { api } from "../../../../lib/api";

// The backend accepts 20; sending fewer keeps the prompt small and the
// follow-up context recent.
const MAX_CHAT_HISTORY = 20;

// The AI limits are the ones worth wording ourselves; everything else shows
// the backend's own sentence, which is written to be shown as-is.
function describeChatError(error) {
  const wait = Number(error?.retryAfter);
  const inAMoment = Number.isFinite(wait) && wait > 0 ? ` Try again in ${Math.ceil(wait)}s.` : "";
  if (error?.code === "ai_cooldown") return `Just a moment between questions.${inAMoment}`;
  if (error?.code === "ai_busy") return `Nautilus is still working on your last question.${inAMoment}`;
  if (error?.code === "stale_revision") return "This PRD changed since you opened it. Reload it to carry on chatting.";
  return error?.message || "Couldn’t reach Nautilus. Try again.";
}

// What "Propose changes" asks for when nothing is typed: the conversation so
// far says what to change.
export const DEFAULT_INSTRUCTION = "Apply the improvements we discussed.";

// The Ask AI tab: chat about one PRD (POST /api/prds/{id}/ai/chat, Om's #80
// wiring). Answers never change the PRD.
// - `chat` / `setChat`: the conversation, held by whoever renders this, so the
//   side panel and split view share it and it survives the editor reloading.
//   Without them the panel keeps its own (give it key={prd.id} then).
// - `onPropose(instruction)`: shows "Propose changes", which turns the
//   conversation into proposed edits to compare (only for people who can
//   edit). `proposing` while that runs; `proposeError` says why it couldn't.
// `standalone` is split view: the chat is its own pane, not a tab in the
// side panel, so it carries no tab wiring and fills the pane.
function AskAiPanel({
  prd,
  id,
  labelledBy,
  hidden,
  standalone = false,
  chat: sharedChat,
  setChat: setSharedChat,
  onPropose,
  proposing = false,
  proposeError = null,
}) {
  const [ownChat, setOwnChat] = useState([]);
  const chat = sharedChat ?? ownChat;
  const setChat = setSharedChat ?? setOwnChat;
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState(null);
  // A reply that arrives after the panel is gone is dropped.
  const mounted = useRef(true);
  const list = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView?.({ block: "nearest" });
  }, [chat, asking, proposing]);

  // What's typed becomes the instruction (and part of the conversation);
  // with nothing typed, the conversation itself says what to change.
  function propose() {
    if (asking || proposing) return;
    const typed = question.trim();
    if (typed) {
      setChat((log) => [...log, { from: "you", text: typed }]);
      setQuestion("");
    }
    setChatError(null);
    onPropose(typed || DEFAULT_INSTRUCTION);
  }

  async function askAi(event) {
    event.preventDefault();
    const asked = question.trim();
    // One request at a time: the backend allows one per user, and a second
    // send would only come back ai_busy.
    if (!asked || asking || proposing) return;

    // What the backend may see: this PRD's recent turns, nothing else.
    const history = chat.slice(-MAX_CHAT_HISTORY).map((message) => ({
      role: message.from === "ai" ? "assistant" : "user",
      content: message.text,
    }));

    const turn = { from: "you", text: asked };
    setChat((log) => [...log, turn]);
    setQuestion("");
    setAsking(true);
    setChatError(null);
    // A shared conversation outlives this panel (split view moves the chat
    // and remounts it), so its answer still goes in after a remount; the
    // owner drops it if another PRD has opened. A panel's own conversation
    // goes with it.
    const keep = () => mounted.current || Boolean(setSharedChat);

    try {
      const reply = await api.chatAboutPrd(prd.id, { revision: prd.revision, message: asked, history });
      if (!keep()) return;
      setChat((log) => [...log, { from: "ai", kind: reply.kind, text: reply.message }]);
    } catch (error) {
      if (!keep()) return;
      // The question goes back out of the conversation (and into the box,
      // if it's still here) so it can be sent again.
      setChat((log) => log.filter((message) => message !== turn));
      if (mounted.current) {
        setQuestion(asked);
        setChatError(describeChatError(error));
      }
    } finally {
      if (mounted.current) setAsking(false);
    }
  }

  return (
    <section
      className={`ne-card ne-chat${standalone ? " ne-chat-standalone" : ""}`}
      role={standalone ? undefined : "tabpanel"}
      id={standalone ? undefined : id}
      aria-labelledby={standalone ? undefined : labelledBy}
      hidden={standalone ? undefined : hidden}
    >
      <div className="ne-card-head">
        <h2 className="ne-card-title">Ask Nautilus</h2>
        <span className="ne-chat-scope">Answers use this PRD only</span>
      </div>
      {chat.length || asking || proposing ? (
        <ol ref={list} className="ne-chat-log" aria-live="polite">
          {chat.map((message, index) => (
            <li key={index} className={`ne-turn ne-turn-${message.from}`}>
              {message.text}
            </li>
          ))}
          {asking ? <li className="ne-turn ne-turn-ai is-waiting">Thinking…</li> : null}
          {proposing ? <li className="ne-turn ne-turn-ai is-waiting">Preparing proposed changes…</li> : null}
        </ol>
      ) : (
        <p className="ne-card-note">
          Ask about what’s in this PRD, like “What are the open risks?” Answers don’t change anything.
          {onPropose ? " When you’re ready, Propose changes turns the conversation into edits you can compare first." : ""}
        </p>
      )}
      {chatError || proposeError ? (
        <p className="ne-chat-error" role="alert">
          {chatError || proposeError}
        </p>
      ) : null}
      <form className="ne-chat-form" onSubmit={askAi}>
        <textarea
          aria-label="Ask Nautilus about this PRD"
          rows={2}
          placeholder="Ask Nautilus about this PRD…"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          }}
        />
        <div className="ne-chat-actions">
          {onPropose ? (
            <button
              type="button"
              className="nw-btn nw-btn-secondary ne-btn-34"
              onClick={propose}
              disabled={asking || proposing || (!chat.length && !question.trim())}
            >
              {proposing ? "Preparing…" : "Propose changes"}
            </button>
          ) : null}
          <button
            type="submit"
            className="nw-btn nw-btn-primary ne-btn-34"
            disabled={asking || proposing || !question.trim()}
          >
            {asking ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AskAiPanel;
