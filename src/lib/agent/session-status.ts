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
  | "waiting_client" // we replied, waiting on the customer
  | "resolved" // admin marked handled
  | "ended" // session formally ended
  | "no_messages" // empty session
  | "caught_up"; // open, nothing outstanding

export type DisplayStatus = { kind: DisplayStatusKind; label: string };

const LABELS: Record<DisplayStatusKind, string> = {
  needs_reply: "Needs reply",
  waiting_client: "Waiting on client",
  resolved: "Resolved",
  ended: "Ended",
  no_messages: "No messages",
  caught_up: "Caught up",
};

/**
 * Decide the badge for a session row.
 *
 * Precedence: an unanswered customer message (needsReply) is always the
 * most urgent and wins, even over an admin-set status — a fresh question
 * must never hide under "Resolved". Otherwise the admin's stored
 * handlingStatus (WAITING_CLIENT / RESOLVED) shows. Falling through to
 * the original derived signals (ended / no messages / caught up).
 */
export function sessionDisplayStatus(input: {
  handlingStatus: string;
  needsReply: boolean;
  hasMessages: boolean;
  ended: boolean;
}): DisplayStatus {
  const kind = ((): DisplayStatusKind => {
    if (input.needsReply) return "needs_reply";
    if (input.handlingStatus === "WAITING_CLIENT") return "waiting_client";
    if (input.handlingStatus === "RESOLVED") return "resolved";
    if (!input.hasMessages) return "no_messages";
    if (input.ended) return "ended";
    return "caught_up";
  })();
  return { kind, label: LABELS[kind] };
}
