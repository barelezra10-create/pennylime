// Admin-controlled triage state for chat sessions, plus the logic that
// decides which badge the sessions list shows. Kept pure (no DB / React)
// so it can be unit-tested and reused by the list page and reply panel.

export const HANDLING_STATUSES = ["OPEN", "WAITING_CLIENT", "RESOLVED"] as const;
export type HandlingStatus = (typeof HANDLING_STATUSES)[number];

export function isHandlingStatus(v: unknown): v is HandlingStatus {
  return typeof v === "string" && (HANDLING_STATUSES as readonly string[]).includes(v);
}

export type DisplayStatusKind =
  | "needs_reply" // customer is waiting on us (urgent)
  | "waiting_client" // we (team or AI) replied last, ball is in the client's court
  | "resolved" // admin marked handled
  | "ended" // session formally ended
  | "no_messages"; // empty session

export type DisplayStatus = { kind: DisplayStatusKind; label: string };

const LABELS: Record<DisplayStatusKind, string> = {
  needs_reply: "Needs reply",
  waiting_client: "Waiting on client",
  resolved: "Resolved",
  ended: "Ended",
  no_messages: "No messages",
};

/**
 * Decide the badge for a session row.
 *
 * Precedence:
 *  1. An unanswered customer message (needsReply) is the most urgent and
 *     always wins, even over a "Resolved" mark — a fresh question must
 *     never hide.
 *  2. A manual "Resolved" mark.
 *  3. Otherwise, if the conversation has messages and isn't ended, we
 *     replied last, so it's automatically "Waiting on client" — no
 *     tagging needed.
 */
export function sessionDisplayStatus(input: {
  handlingStatus: string;
  needsReply: boolean;
  hasMessages: boolean;
  ended: boolean;
}): DisplayStatus {
  const kind = ((): DisplayStatusKind => {
    if (input.needsReply) return "needs_reply";
    if (input.handlingStatus === "RESOLVED") return "resolved";
    if (!input.hasMessages) return "no_messages";
    if (input.ended) return "ended";
    return "waiting_client";
  })();
  return { kind, label: LABELS[kind] };
}
