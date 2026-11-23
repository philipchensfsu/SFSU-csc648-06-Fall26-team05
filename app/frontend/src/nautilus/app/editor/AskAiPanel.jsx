import { useEffect, useRef, useState } from "react";
import { api } from "../../../../lib/api";
import { IconPlus, IconX } from "../icons";
import { IconArrowUp } from "./editorIcons";

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

// Ask Nautilus: chat about one PRD (POST /api/prds/{id}/ai/chat, Om's #80
// wiring). Answers never change the PRD.
// - `chat` / `setChat`: the conversation, held by whoever renders this, so it
//   survives the side panel closing and the editor reloading.
//   Without them the panel keeps its own (give it key={prd.id} then).
// - `onPropose(instruction)`: shows "Propose changes", which turns the
//   conversation into proposed edits to compare (only for people who can
//   edit). `proposing` while that runs; `proposeError` says why it couldn't.
// `standalone`: the chat fills the editor's side panel and carries no tab
// wiring. It has its own header (with "New conversation" and, with
// `onClose`, a close button), the conversation scrolling under it and the
// question box docked at the bottom. Without it the panel is a tab panel
// (id, labelledBy, hidden).
function AskAiPanel({
  prd,
  id,
  labelledBy,
  hidden,
  standalone = false,
  onClose,
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
    // A shared conversation outlives this panel (closing the side panel
    // unmounts it), so its answer still goes in after a remount; the
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

  // Starts the conversation over. Nothing is saved, so there's nothing to lose
  // beyond the turns on screen.
  function newConversation() {
    setChat([]);
    setChatError(null);
  }

  const busy = asking || proposing;
  const conversation = chat.length || busy ? (
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
  );
  const problemNote =
    chatError || proposeError ? (
      <p className="ne-chat-error" role="alert">
        {chatError || proposeError}
      </p>
    ) : null;
  const box = (
    <textarea
      aria-label="Ask Nautilus about this PRD"
      rows={2}
      placeholder={chat.length ? "Ask a follow-up, or tell Nautilus what to change…" : "Ask Nautilus about this PRD…"}
      value={question}
      onChange={(event) => setQuestion(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          event.currentTarget.form.requestSubmit();
        }
      }}
    />
  );
  const proposeButton = onPropose ? (
    <button
      type="button"
      className="nw-btn nw-btn-secondary ne-btn-34"
      onClick={propose}
      disabled={busy || (!chat.length && !question.trim())}
    >
      {proposing ? "Preparing…" : "Propose changes"}
    </button>
  ) : null;

  if (standalone) {
    return (
      <section className="ne-chat ne-chat-standalone" aria-labelledby={`ne-chat-title-${prd.id}`}>
        <div className="ne-chat-head">
          <span className="ne-chat-badge" aria-hidden="true">
            N
          </span>
          <h2 id={`ne-chat-title-${prd.id}`} className="ne-chat-name">
            Nautilus
          </h2>
          <span className="ne-chat-scope">Answers use this PRD only</span>
          <div className="ne-chat-tools">
            <button
              type="button"
              className="ne-chat-tool"
              aria-label="New conversation"
              title="New conversation"
              onClick={newConversation}
              disabled={busy || !chat.length}
            >
              <IconPlus size={16} />
            </button>
            {onClose ? (
              <button type="button" className="ne-chat-tool" aria-label="Close Ask Nautilus" title="Close" onClick={onClose}>
                <IconX size={16} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="ne-chat-scroll">{conversation}</div>
        <form className="ne-chat-composer" onSubmit={askAi}>
          {problemNote}
          <div className="ne-chat-box">
            {box}
            <div className="ne-chat-actions">
              {proposeButton}
              <button type="submit" className="ne-chat-send" disabled={busy || !question.trim()}>
                <IconArrowUp />
                <span className="nw-sr">{asking ? "Sending…" : "Send"}</span>
              </button>
            </div>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="ne-card ne-chat" role="tabpanel" id={id} aria-labelledby={labelledBy} hidden={hidden}>
      <div className="ne-card-head">
        <h2 className="ne-card-title">Ask Nautilus</h2>
        <span className="ne-chat-scope">Answers use this PRD only</span>
      </div>
      {conversation}
      {problemNote}
      <form className="ne-chat-form" onSubmit={askAi}>
        {box}
        <div className="ne-chat-actions">
          {proposeButton}
          <button type="submit" className="nw-btn nw-btn-primary ne-btn-34" disabled={busy || !question.trim()}>
            {asking ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AskAiPanel;
