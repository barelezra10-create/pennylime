// Pure merge of polled server messages into local widget state.

export type ChatMsg = {
  id: string;
  text: string;
  authoredBy: "user" | "ai" | "admin";
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
};

/**
 * Appends incoming server messages, deduping by id. A pending optimistic
 * user message is replaced by its server echo (matched by authoredBy
 * "user" + identical text); pending messages without an echo stay at the
 * end so the user never loses what they typed.
 */
export function mergeMessages(existing: ChatMsg[], incoming: ChatMsg[]): ChatMsg[] {
  const known = new Set(existing.filter((m) => !m.pending).map((m) => m.id));
  const fresh = incoming.filter((m) => !known.has(m.id));

  let settled = existing.filter((m) => !m.pending);
  let pendings = existing.filter((m) => m.pending);

  for (const msg of fresh) {
    if (msg.authoredBy === "user") {
      const echoIdx = pendings.findIndex((p) => p.text === msg.text);
      if (echoIdx !== -1) pendings = pendings.filter((_, i) => i !== echoIdx);
    }
    settled = [...settled, msg];
  }
  return [...settled, ...pendings];
}
