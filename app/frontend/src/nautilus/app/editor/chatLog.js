// The open PRD's Ask AI conversation, as Prototype keeps it: { prdId,
// messages } or null.
//
// AI replies arrive after an await, through callbacks bound to the PRD that
// was open when the request started. If another PRD has opened since, the
// reply belongs to a conversation that's gone, so it's dropped instead of
// replacing the new PRD's conversation (and being sent as its history).
export function updateChatLog(current, prdId, openPrdId, update) {
  if (prdId !== openPrdId) return current;
  const messages = current?.prdId === prdId ? current.messages : [];
  return { prdId, messages: typeof update === "function" ? update(messages) : update };
}

export function chatMessages(current, prdId) {
  return current?.prdId === prdId ? current.messages : [];
}
