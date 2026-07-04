import { describe, it, expect } from "vitest";
import { sortConversations, type SortableConversation } from "./sort-conversations";

const c = (id: string, needsReply: boolean, waitingSinceMs: number | null, lastMessageAtMs: number): SortableConversation => ({
  id,
  needsReply,
  waitingSinceMs,
  lastMessageAtMs,
});

describe("sortConversations", () => {
  it("puts needs-reply first, oldest-waiting first within that group", () => {
    const rows = [
      c("recent", false, null, 5000),
      c("waiting-new", true, 4000, 4000),
      c("waiting-old", true, 1000, 1000),
      c("older", false, null, 2000),
    ];
    expect(sortConversations(rows).map((r) => r.id)).toEqual(["waiting-old", "waiting-new", "recent", "older"]);
  });

  it("sorts non-needs-reply by last message desc", () => {
    const rows = [c("a", false, null, 1), c("b", false, null, 3), c("x", false, null, 2)];
    expect(sortConversations(rows).map((r) => r.id)).toEqual(["b", "x", "a"]);
  });
});
