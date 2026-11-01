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

// The Ask AI tab: answer-only chat about one PRD (POST /api/prds/{id}/ai/chat,
// Om's #80 wiring). The conversation lives only here, so give it key={prd.id}
// to start fresh on another PRD. It stays mounted while the Review tab is
// showing, so switching tabs keeps the conversation.
function AskAiPanel({ prd, id, labelledBy, hidden }) {
  const [chat, setChat] = useState([]);
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
    list.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [chat, asking]);

  async function askAi(event) {
    event.preventDefault();
    const asked = question.trim();
    // One request at a time: the backend allows one per user, and a second
    // send would only come back ai_busy.
    if (!asked || asking) return;

    // What the backend may see: this PRD's recent turns, nothing else.
    const history = chat.slice(-MAX_CHAT_HISTORY).map((message) => ({
      role: message.from === "ai" ? "assistant" : "user",
      content: message.text,
    }));

    setChat((log) => [...log, { from: "you", text: asked }]);
    setQuestion("");
    setAsking(true);
    setChatError(null);

    try {
      const reply = await api.chatAboutPrd(prd.id, { revision: prd.revision, message: asked, history });
      if (!mounted.current) return;
      setChat((log) => [...log, { from: "ai", kind: reply.kind, text: reply.message }]);
    } catch (error) {
      if (!mounted.current) return;
      // Keep what they typed so they can send it again.
      setQuestion(asked);
      setChat((log) => log.slice(0, -1));
      setChatError(describeChatError(error));
    } finally {
      if (mounted.current) setAsking(false);
    }
  }

  return (
    <section className="ne-card ne-chat" role="tabpanel" id={id} aria-labelledby={labelledBy} hidden={hidden}>
      <div className="ne-card-head">
        <h2 className="ne-card-title">Ask Nautilus about this PRD</h2>
      </div>
      {chat.length || asking ? (
        <ol ref={list} className="ne-chat-log" aria-live="polite">
          {chat.map((message, index) => (
            <li key={index} className={`ne-bubble ne-bubble-${message.from}`}>
              {message.text}
            </li>
          ))}
          {asking ? <li className="ne-bubble ne-bubble-ai is-waiting">Thinking…</li> : null}
        </ol>
      ) : (
        <p className="ne-card-note">
          Ask about what’s in this PRD, like “What are the open risks?” Answers only use this PRD, and nothing is changed.
        </p>
      )}
      {chatError ? (
        <p className="ne-chat-error" role="alert">
          {chatError}
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
        <button type="submit" className="nw-btn nw-btn-primary ne-btn-34" disabled={asking || !question.trim()}>
          {asking ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}

export default AskAiPanel;
