import "server-only";
import { prisma } from "@/lib/db";
import { easternDateString } from "@/lib/eastern-time";
import { sendEmail } from "@/lib/emails/send";

function easternMidnight(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const formattedAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
    instant += target - formattedAsUtc;
  }
  return new Date(instant);
}

export function previousEasternDateString(from = new Date()) {
  const current = easternDateString(from);
  const [year, month, day] = current.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function isNsfReason(reason: string | null) {
  return !!reason && /(insufficient funds|\bR0?1\b|nsf)/i.test(reason);
}

export async function getRevenuePeriods(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const yearStart = easternMidnight(`${year}-01-01`);
  const monthStart = easternMidnight(`${year}-${String(month).padStart(2, "0")}-01`);
  const cutoff = easternMidnight(new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10));
  const [clearedRows, nsfRows, sentRows] = await Promise.all([
    prisma.paymentAttempt.findMany({
      where: { finalStatus: "PAID", settledAt: { gte: yearStart, lt: cutoff } },
      select: { amount: true, settledAt: true },
    }),
    prisma.paymentAttempt.findMany({
      where: { finalStatus: "RETURNED", initiatedAt: { gte: yearStart, lt: cutoff } },
      select: { amount: true, initiatedAt: true, returnReason: true },
    }),
    prisma.application.findMany({
      where: { fundedAt: { gte: yearStart, lt: cutoff } },
      select: { fundedAt: true, fundedAmount: true, loanAmount: true },
    }),
  ]);
  const sum = (items: ReadonlyArray<{ amount: unknown }>) => items.reduce((total, row) => total + Number(row.amount), 0);
  const mtdCleared = clearedRows.filter((row) => row.settledAt && row.settledAt >= monthStart);
  // Return events have no timestamp in our processor history, so attribute NSF
  // counts to the date the debit was initiated, matching the daily report.
  const ytdNsf = nsfRows.filter((row) => isNsfReason(row.returnReason));
  const mtdNsf = ytdNsf.filter((row) => row.initiatedAt >= monthStart);
  const mtdSent = sentRows.filter((row) => row.fundedAt && row.fundedAt >= monthStart);
  const sentAmount = (items: typeof sentRows) => items.reduce((total, row) => total + Number(row.fundedAmount ?? row.loanAmount), 0);
  return {
    mtd: {
      clearedCount: mtdCleared.length, clearedAmount: sum(mtdCleared),
      nsfCount: mtdNsf.length, nsfAmount: sum(mtdNsf),
      sentCount: mtdSent.length, sentAmount: sentAmount(mtdSent),
    },
    ytd: {
      clearedCount: clearedRows.length, clearedAmount: sum(clearedRows),
      nsfCount: ytdNsf.length, nsfAmount: sum(ytdNsf),
      sentCount: sentRows.length, sentAmount: sentAmount(sentRows),
    },
  };
}

export async function getDailyRevenueSnapshot(date: string) {
  const start = easternMidnight(date);
  const [year, month, day] = date.split("-").map(Number);
  const end = easternMidnight(new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10));
  const [dayAttempts, inFlight, clearedPeriods] = await Promise.all([
    prisma.paymentAttempt.findMany({
      where: { OR: [
        { initiatedAt: { gte: start, lt: end } },
        { settledAt: { gte: start, lt: end } },
      ] },
      orderBy: { initiatedAt: "desc" },
      include: { payment: { include: { application: { select: { applicationCode: true, firstName: true, lastName: true } } } } },
    }),
    prisma.paymentAttempt.findMany({
      where: {
        finalStatus: null,
        increaseTransferStatus: { notIn: ["settled", "complete", "returned", "rejected", "failed", "canceled", "cancelled"] },
      },
      orderBy: { initiatedAt: "asc" },
      include: { payment: { include: { application: { select: { applicationCode: true, firstName: true, lastName: true } } } } },
    }),
    getRevenuePeriods(date),
  ]);

  const initiated = dayAttempts.filter((a) => a.initiatedAt >= start && a.initiatedAt < end);
  const cleared = dayAttempts.filter((a) => a.finalStatus === "PAID" && a.settledAt && a.settledAt >= start && a.settledAt < end);
  const returned = initiated.filter((a) => a.finalStatus === "RETURNED");
  const nsf = returned.filter((a) => isNsfReason(a.returnReason));
  const otherReturns = returned.filter((a) => !isNsfReason(a.returnReason));
  const amount = (rows: typeof dayAttempts) => rows.reduce((total, row) => total + Number(row.amount), 0);
  return {
    date, start, end, periods: clearedPeriods,
    initiated, cleared, nsf, otherReturns, inFlight,
    counts: { processed: initiated.length, cleared: cleared.length, nsf: nsf.length, otherReturns: otherReturns.length, processing: inFlight.length },
    amounts: { processed: amount(initiated), cleared: amount(cleared), nsf: amount(nsf), otherReturns: amount(otherReturns), processing: amount(inFlight) },
    dayAttempts,
    activity: Array.from(new Map([...dayAttempts, ...inFlight].map((attempt) => [attempt.id, attempt])).values()),
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function dailyRevenueEmail(date: string, report: Awaited<ReturnType<typeof getDailyRevenueSnapshot>>) {
  const rows = (items: typeof report.activity, status: (item: typeof report.activity[number]) => boolean) => {
    const filtered = items.filter(status);
    if (!filtered.length) return "<tr><td colspan=\"4\" style=\"padding:12px;color:#777\">No activity</td></tr>";
    return filtered.map((item) => {
      const app = item.payment.application;
      const name = escapeHtml(`${app.firstName} ${app.lastName}`);
      const code = escapeHtml(app.applicationCode);
      const result = escapeHtml(item.finalStatus === "PAID" ? "Cleared" : item.finalStatus === "RETURNED" ? (isNsfReason(item.returnReason) ? "NSF returned" : "Returned") : item.finalStatus ?? "Processing");
      return `<tr><td style="padding:9px;border-top:1px solid #eee">${name}<br><span style="color:#777;font-size:12px">${code} · Attempt ${item.attemptNumber}</span></td><td style="padding:9px;border-top:1px solid #eee">${result}</td><td style="padding:9px;border-top:1px solid #eee">${money(Number(item.amount))}</td><td style="padding:9px;border-top:1px solid #eee">${item.returnReason ? escapeHtml(item.returnReason) : "—"}</td></tr>`;
    }).join("");
  };
  const summary = [
    ["ACH cleared", report.counts.cleared, report.amounts.cleared],
    ["Cleared MTD", report.periods.mtd.clearedCount, report.periods.mtd.clearedAmount],
    ["Cleared YTD", report.periods.ytd.clearedCount, report.periods.ytd.clearedAmount],
    ["Sent to borrowers MTD", report.periods.mtd.sentCount, report.periods.mtd.sentAmount],
    ["Sent to borrowers YTD", report.periods.ytd.sentCount, report.periods.ytd.sentAmount],
    ["NSF returns MTD", report.periods.mtd.nsfCount, report.periods.mtd.nsfAmount],
    ["NSF returns YTD", report.periods.ytd.nsfCount, report.periods.ytd.nsfAmount],
    ["NSF returns", report.counts.nsf, report.amounts.nsf],
    ["Other returns", report.counts.otherReturns, report.amounts.otherReturns],
    ["Currently processing", report.counts.processing, report.amounts.processing],
    ["Processed today", report.counts.processed, report.amounts.processed],
  ] as const;
  return {
    subject: `PennyLime daily ACH report — ${date}`,
    html: `<div style="font-family:Arial,sans-serif;color:#222;max-width:760px;margin:auto"><h1 style="font-size:24px">Daily ACH report</h1><p style="color:#666">${escapeHtml(date)} · Eastern Time</p><table style="border-collapse:collapse;width:100%;margin:20px 0"><thead><tr style="text-align:left;background:#f5f7f5"><th style="padding:10px">Activity</th><th style="padding:10px">Count</th><th style="padding:10px">Amount</th></tr></thead><tbody>${summary.map(([label, count, total]) => `<tr><td style="padding:10px;border-top:1px solid #eee">${label}</td><td style="padding:10px;border-top:1px solid #eee">${count}</td><td style="padding:10px;border-top:1px solid #eee;font-weight:bold">${money(total)}</td></tr>`).join("")}</tbody></table><h2 style="font-size:18px;margin-top:28px">ACH activity</h2><table style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr style="text-align:left;background:#f5f7f5"><th style="padding:9px">Customer</th><th style="padding:9px">Status</th><th style="padding:9px">Amount</th><th style="padding:9px">Return reason</th></tr></thead><tbody>${rows(report.activity, () => true)}</tbody></table><p style="font-size:12px;color:#777;margin-top:20px">Returns are grouped by ACH attempt start date because processor history does not store a return timestamp. Cleared amounts use settlement date. Amounts reflect each attempt, including retries and partial collections. Currently processing includes attempts without a recorded final status.</p></div>`,
  };
}

export async function sendDailyRevenueReportForDate(date: string) {
  const config = await prisma.notificationConfig.findUnique({ where: { id: "singleton" } });
  const recipients = (config?.dailyRevenueEmails ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  if (!recipients.length) return { sent: 0, failed: 0, skipped: "no recipients configured" };
  if (config?.dailyRevenueLastSentDate === date) return { sent: 0, failed: 0, skipped: "already sent" };

  const report = await getDailyRevenueSnapshot(date);
  const email = dailyRevenueEmail(date, report);
  const results = await Promise.all(recipients.map((to) => sendEmail({ to, ...email, templateId: "daily-revenue-report" })));
  const failed = results.filter((result) => !result.success).length;
  if (!failed) {
    await prisma.notificationConfig.upsert({
      where: { id: "singleton" },
      update: { dailyRevenueLastSentDate: date },
      create: { id: "singleton", dailyRevenueLastSentDate: date },
    });
  }
  return { sent: recipients.length - failed, failed };
}
