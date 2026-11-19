import { describe, expect, it } from "vitest";
import { MAX_MENTIONS, insertMention, matchPeople, mentionIds, mentionQuery, splitMentions } from "./mentions";

const ken = { user_id: "ken", name: "Ken Tanaka", email: "ken@example.com", role: "editor" };
const kemi = { user_id: "kemi", name: "Kemi Osei", email: "kemi@example.com", role: "viewer" };
const nadia = { user_id: "nadia", name: "Nadia Haddad", email: "nadia@example.com", role: "owner" };
const people = [ken, kemi, nadia];

describe("mentionQuery", () => {
  it("finds the @query just before the caret", () => {
    expect(mentionQuery("Can @Ke", 7)).toEqual({ start: 4, query: "Ke" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("Hi\n@Ken Ta", 10)).toEqual({ start: 3, query: "Ken Ta" });
  });

  it("ignores an @ inside a word, after a line break or followed by a space", () => {
    expect(mentionQuery("mail me@example", 15)).toBeNull();
    expect(mentionQuery("@Ken\nnext", 9)).toBeNull();
    expect(mentionQuery("@ Ken", 5)).toBeNull();
    expect(mentionQuery("no at sign", 10)).toBeNull();
  });

  it("closes once the name is followed by a space, as after a pick", () => {
    expect(mentionQuery("@Kemi Osei ", 11)).toBeNull();
    expect(mentionQuery("@Ken T", 6)).toEqual({ start: 0, query: "Ken T" });
  });

  it("only looks before the caret", () => {
    expect(mentionQuery("@Ken and more", 4)).toEqual({ start: 0, query: "Ken" });
  });
});

describe("matchPeople", () => {
  it("matches the start of a name, of any word in it, or of the email", () => {
    expect(matchPeople(people, "ke").map((p) => p.user_id)).toEqual(["ken", "kemi"]);
    expect(matchPeople(people, "tan").map((p) => p.user_id)).toEqual(["ken"]);
    expect(matchPeople(people, "NADIA@").map((p) => p.user_id)).toEqual(["nadia"]);
    expect(matchPeople(people, "Ken Ta").map((p) => p.user_id)).toEqual(["ken"]);
  });

  it("lists everyone for an empty query, up to the limit", () => {
    expect(matchPeople(people, "")).toHaveLength(3);
    expect(matchPeople(people, "", 2)).toHaveLength(2);
  });

  it("skips people with neither a name nor an email", () => {
    expect(matchPeople([{ user_id: "x", name: null, email: null }], "")).toEqual([]);
  });
});

describe("insertMention", () => {
  it("replaces the query with the name and a space, keeping the rest", () => {
    expect(insertMention("Can @Ke check this?", 4, 7, ken)).toEqual({
      text: "Can @Ken Tanaka  check this?",
      caret: 16,
    });
  });

  it("falls back to the email when there's no name", () => {
    expect(insertMention("@e", 0, 2, { user_id: "e", name: null, email: "e@x.org" }).text).toBe("@e@x.org ");
  });
});

describe("mentionIds", () => {
  it("keeps picked people whose @Name is still in the body, once each", () => {
    expect(mentionIds("@Ken Tanaka and @Kemi Osei", [ken, kemi, ken])).toEqual(["ken", "kemi"]);
  });

  it("drops a pick whose @Name was deleted", () => {
    expect(mentionIds("Thanks, Kemi Osei", [kemi])).toEqual([]);
  });

  it("stops at the API's limit", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ user_id: `u${i}`, name: `P${i}` }));
    const body = many.map((p) => `@${p.name}`).join(" ");
    expect(mentionIds(body, many)).toHaveLength(MAX_MENTIONS);
  });
});

describe("splitMentions", () => {
  it("marks each @Name from the comment's mentions", () => {
    expect(splitMentions("Can @Ken Tanaka check? cc @Kemi Osei", [{ name: "Ken Tanaka" }, { name: "Kemi Osei" }])).toEqual([
      { text: "Can " },
      { text: "@Ken Tanaka", mention: true },
      { text: " check? cc " },
      { text: "@Kemi Osei", mention: true },
    ]);
  });

  it("prefers the longest name and treats names as plain text, not patterns", () => {
    expect(splitMentions("@Ken Tanaka", [{ name: "Ken" }, { name: "Ken Tanaka" }])).toEqual([
      { text: "@Ken Tanaka", mention: true },
    ]);
    expect(splitMentions("@a.b and @axb", [{ name: "a.b" }])).toEqual([
      { text: "@a.b", mention: true },
      { text: " and @axb" },
    ]);
  });

  it("leaves the body whole without mentions", () => {
    expect(splitMentions("plain @Someone", [])).toEqual([{ text: "plain @Someone" }]);
    expect(splitMentions("plain", undefined)).toEqual([{ text: "plain" }]);
  });
});
