import { describe, it, expect } from "vitest";
import { mergeMessages, type ChatMsg } from "./merge-messages";

const m = (id: string, text: string, authoredBy: ChatMsg["authoredBy"] = "user", pending = false): ChatMsg => ({
  id,
  text,
  authoredBy,
  createdAt: "2026-07-05T10:00:00.000Z",
  pending,
});

describe("mergeMessages", () => {
  it("appends new server messages and dedupes by id", () => {
    const existing = [m("1", "hi"), m("2", "hello", "ai")];
    const incoming = [m("2", "hello", "ai"), m("3", "how can I help", "ai")];
    expect(mergeMessages(existing, incoming).map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("replaces a pending optimistic user message when the server echo arrives", () => {
    const existing = [m("srv-1", "hi"), m("tmp-abc", "my balance?", "user", true)];
    const incoming = [m("srv-2", "my balance?", "user")];
    const out = mergeMessages(existing, incoming);
    expect(out.map((x) => x.id)).toEqual(["srv-1", "srv-2"]);
    expect(out.some((x) => x.pending)).toBe(false);
  });

  it("keeps a pending message that has no server echo yet", () => {
    const existing = [m("tmp-1", "typing away", "user", true)];
    const incoming = [m("srv-9", "welcome!", "ai")];
    expect(mergeMessages(existing, incoming).map((x) => x.id)).toEqual(["srv-9", "tmp-1"]);
  });
});
