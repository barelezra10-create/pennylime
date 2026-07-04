// Pure ordering for the admin chat inbox list.

export type SortableConversation = {
  id: string;
  needsReply: boolean;
  waitingSinceMs: number | null;
  lastMessageAtMs: number;
};

/** Needs-reply first (longest-waiting on top), then everything else by recency. */
export function sortConversations<T extends SortableConversation>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.needsReply !== b.needsReply) return a.needsReply ? -1 : 1;
    if (a.needsReply && b.needsReply) {
      return (a.waitingSinceMs ?? 0) - (b.waitingSinceMs ?? 0);
    }
    return b.lastMessageAtMs - a.lastMessageAtMs;
  });
}
