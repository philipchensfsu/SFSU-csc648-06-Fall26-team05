import { describe, expect, it } from "vitest";
import { chatMessages, updateChatLog } from "./chatLog";

const turn = (text) => ({ from: "ai", kind: "answer", text });

describe("updateChatLog", () => {
  it("adds to the open PRD's conversation", () => {
    const log = updateChatLog({ prdId: "a", messages: [turn("one")] }, "a", "a", (messages) => [...messages, turn("two")]);
    expect(log).toEqual({ prdId: "a", messages: [turn("one"), turn("two")] });
  });

  it("starts a conversation for the open PRD", () => {
    expect(updateChatLog(null, "a", "a", [turn("hi")])).toEqual({ prdId: "a", messages: [turn("hi")] });
  });

  it("drops a late reply for a PRD that's no longer open, keeping the open one's conversation", () => {
    // Proposed on A, opened B, then A's explanation came back.
    const b = { prdId: "b", messages: [turn("about B")] };
    expect(updateChatLog(b, "a", "b", (messages) => [...messages, turn("about A")])).toBe(b);
    expect(updateChatLog(null, "a", null, [turn("about A")])).toBeNull(); // back on the dashboard
  });
});

describe("chatMessages", () => {
  it("returns only the asked PRD's conversation", () => {
    expect(chatMessages({ prdId: "a", messages: [turn("x")] }, "a")).toEqual([turn("x")]);
    expect(chatMessages({ prdId: "a", messages: [turn("x")] }, "b")).toEqual([]);
    expect(chatMessages(null, "a")).toEqual([]);
  });
});
