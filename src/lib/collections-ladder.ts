// Shared collections ladder: the schedule of dunning emails/texts an overdue or
// defaulted account moves through. Kept in one place so the collections cron and
// the account-level timeline UI describe the exact same steps.

export const OVERDUE_WARN_1_DAYS = 7; // first past-due notice
export const OVERDUE_WARN_2_DAYS = 14; // second notice + flip to LATE
export const COLLECTIONS_ESCALATE_DAYS = 30; // default; overridden by rules.collections_threshold_days
export const FINAL_NOTICE_DAYS = 15; // days AFTER escalation for the pre-legal final notice
export const DUNNING_INTERVAL_DAYS = 4; // recurring dunning cadence while in collections
export const DEFAULT_DAYS = 90; // default; days AFTER escalation before we mark DEFAULTED

const DAY = 86400000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const floorDays = (ms: number) => Math.floor(ms / DAY);

export type TimelinePayment = {
  status: string;
  amount: number;
  lateFee: number;
  dueDate: string | Date;
};
export type TimelineEvent = {
  eventType: string;
  notes: string | null;
  createdAt: string | Date;
};

export type TimelineStep = {
  label: string;
  channel: string; // "Email + SMS" etc.
  date: Date | null; // when it happened (sent) or is projected (upcoming)
  note?: string;
};

export type CollectionsTimeline = {
  status: string;
  outstanding: number;
  daysInCollections: number | null;
  escalatedAt: Date | null;
  sent: TimelineStep[]; // already fired, oldest first
  upcoming: TimelineStep[]; // projected, soonest first
};

function labelForEvent(e: TimelineEvent): string {
  const n = (e.notes || "").toLowerCase();
  if (e.eventType === "ESCALATED") return "Escalated to collections";
  if (e.eventType === "DEFAULTED") return "Marked defaulted, referred for recovery";
  if (e.eventType === "DUNNING") return "Collections reminder";
  if (e.eventType === "WARNING_SENT") {
    if (n.includes("final-notice")) return "Final pre-legal notice";
    if (n.includes("14-day")) return "Second past-due warning";
    if (n.includes("7-day")) return "First past-due warning";
    return "Past-due warning";
  }
  return e.eventType.replace(/_/g, " ").toLowerCase();
}

/**
 * Build the sent + upcoming collections steps for one account. Pure/derived so
 * the UI can render "what went out and what's next" without hitting the cron.
 */
export function buildCollectionsTimeline(input: {
  status: string;
  payments: TimelinePayment[];
  events: TimelineEvent[];
  now?: Date;
  collectionsThresholdDays?: number;
  defaultThresholdDays?: number;
}): CollectionsTimeline {
  const now = input.now ?? new Date();
  const escalateDays = input.collectionsThresholdDays ?? COLLECTIONS_ESCALATE_DAYS;
  const defaultDays = input.defaultThresholdDays ?? DEFAULT_DAYS;

  const unpaid = input.payments.filter((p) => p.status === "PENDING" || p.status === "FAILED");
  const outstanding = unpaid.reduce((s, p) => s + Number(p.amount) + Number(p.lateFee), 0);

  const events = input.events
    .map((e) => ({ ...e, at: new Date(e.createdAt) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const escalatedAt = events.find((e) => e.eventType === "ESCALATED")?.at ?? null;
  const daysInCollections = escalatedAt ? floorDays(now.getTime() - escalatedAt.getTime()) : null;

  const sent: TimelineStep[] = events.map((e) => ({
    label: labelForEvent(e),
    channel: "Email + SMS",
    date: e.at,
    note: e.notes || undefined,
  }));

  const upcoming: TimelineStep[] = [];
  const isDefaulted = input.status === "DEFAULTED";
  const isCollections = input.status === "COLLECTIONS";

  if (isCollections) {
    // If we don't yet have an escalation timestamp (account reached collections
    // via the roll service), anchor the projection to now: the cron backfills
    // the escalation and starts the flow on its next run.
    const ref = escalatedAt ?? now;
    const lastComm = events
      .filter((e) => ["WARNING_SENT", "DUNNING", "ESCALATED"].includes(e.eventType))
      .map((e) => e.at)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const nextDunning = lastComm ? addDays(lastComm, DUNNING_INTERVAL_DAYS) : now;
    upcoming.push({
      label: "Collections reminder",
      channel: "Email + SMS",
      date: nextDunning < now ? now : nextDunning,
      note: `Repeats every ${DUNNING_INTERVAL_DAYS} days until paid or defaulted`,
    });

    const finalSent = events.some(
      (e) => e.eventType === "WARNING_SENT" && (e.notes || "").toLowerCase().includes("final-notice"),
    );
    if (!finalSent) {
      upcoming.push({
        label: "Final pre-legal notice",
        channel: "Email + SMS",
        date: addDays(ref, FINAL_NOTICE_DAYS),
        note: "Last notice before referral / legal action",
      });
    }
    upcoming.push({
      label: "Mark defaulted, refer for recovery",
      channel: "Status change",
      date: addDays(ref, defaultDays),
    });
  } else if (!isDefaulted) {
    // Still in repayment: project the pre-collections warnings off the oldest
    // still-overdue payment.
    const overdue = unpaid
      .map((p) => new Date(p.dueDate))
      .filter((d) => d.getTime() < now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    const firstOverdue = overdue[0] ?? null;
    if (firstOverdue) {
      const has = (frag: string) =>
        events.some((e) => e.eventType === "WARNING_SENT" && (e.notes || "").includes(frag));
      if (!has("7-day"))
        upcoming.push({ label: "First past-due warning", channel: "Email + SMS", date: addDays(firstOverdue, OVERDUE_WARN_1_DAYS) });
      if (!has("14-day"))
        upcoming.push({ label: "Second past-due warning", channel: "Email + SMS", date: addDays(firstOverdue, OVERDUE_WARN_2_DAYS) });
      upcoming.push({ label: "Escalate to collections", channel: "Status + Email + SMS", date: addDays(firstOverdue, escalateDays) });
    }
  }

  upcoming.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  return { status: input.status, outstanding, daysInCollections, escalatedAt, sent, upcoming };
}
