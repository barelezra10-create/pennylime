import Link from "next/link";
import { prisma } from "@/lib/db";
import { easternDateString } from "@/lib/eastern-time";
import { getClearedPeriods, isNsfReason } from "@/lib/daily-revenue";
import { RevenueReportRecipients } from "./revenue-report-recipients";

export const dynamic = "force-dynamic";

function easternMidnight(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  // Find the UTC instant that formats as midnight in America/New_York.
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const formattedAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
    instant += target - formattedAsUtc;
  }
  return new Date(instant);
}

function dollars(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function Metric({ title, count, amount, detail, tone = "green" }: {
  title: string; count: number; amount: number; detail: string; tone?: "green" | "red" | "blue" | "amber";
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    blue: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <section className="rounded-2xl border border-[#e7e7e2] bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-[#686861]">{title}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-4xl font-semibold tracking-tight text-[#171714]">{count}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{detail}</span>
      </div>
      <p className="mt-2 text-lg font-semibold text-[#34342f]">{dollars(amount)}</p>
      <p className="mt-1 text-xs text-[#8a8a83]">{count === 1 ? "ACH attempt" : "ACH attempts"}</p>
    </section>
  );
}

export default async function DailyRevenuePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const today = easternDateString();
  const requestedDate = params.date;
  const parsedDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? new Date(`${requestedDate}T00:00:00Z`) : null;
  const date = parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === requestedDate && requestedDate <= today
    ? requestedDate
    : today;
  const start = easternMidnight(date);
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const end = easternMidnight(nextDate);

  const [dayAttempts, inFlight, clearedPeriods] = await Promise.all([
    prisma.paymentAttempt.findMany({
      where: {
        OR: [
          { initiatedAt: { gte: start, lt: end } },
          { settledAt: { gte: start, lt: end } },
        ],
      },
      orderBy: { initiatedAt: "desc" },
      include: {
        payment: { include: { application: { select: { applicationCode: true, firstName: true, lastName: true } } } },
      },
    }),
    prisma.paymentAttempt.findMany({
      where: {
        finalStatus: null,
        increaseTransferStatus: { notIn: ["settled", "complete", "returned", "rejected", "failed", "canceled", "cancelled"] },
      },
      orderBy: { initiatedAt: "asc" },
      include: {
        payment: { include: { application: { select: { applicationCode: true, firstName: true, lastName: true } } } },
      },
    }),
    getClearedPeriods(date),
  ]);

  const initiatedToday = dayAttempts.filter((a) => a.initiatedAt >= start && a.initiatedAt < end);
  const clearedToday = dayAttempts.filter((a) => a.finalStatus === "PAID" && a.settledAt && a.settledAt >= start && a.settledAt < end);
  // PaymentAttempt stores settlement timestamps, but no return timestamp. Returns are
  // therefore attributed to the ACH initiation date until the source data is extended.
  const returnedToday = initiatedToday.filter((a) => a.finalStatus === "RETURNED");
  const nsfToday = returnedToday.filter((a) => isNsfReason(a.returnReason));
  const otherReturnsToday = returnedToday.filter((a) => !isNsfReason(a.returnReason));
  const sum = (rows: typeof dayAttempts) => rows.reduce((total, row) => total + Number(row.amount), 0);
  const fmtDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "full" }).format(start);
  const config = await prisma.notificationConfig.findUnique({ where: { id: "singleton" }, select: { dailyRevenueEmails: true, dailyRevenueLastSentDate: true } });

  const allRows = [...dayAttempts].sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime());

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link href="/admin/payments" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">← Payments</Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#171714]">Daily revenue center</h1>
          <p className="mt-1 text-sm text-[#77776f]">ACH collections and activity for {fmtDate} (Eastern Time).</p>
        </div>
        <form className="flex items-center gap-2 rounded-xl border border-[#e7e7e2] bg-white p-2 shadow-sm">
          <label htmlFor="revenue-date" className="pl-2 text-sm font-medium text-[#55554e]">Day</label>
          <input id="revenue-date" type="date" name="date" defaultValue={date} max={today} className="rounded-lg border border-[#e7e7e2] px-3 py-2 text-sm text-[#252520]" />
          <button className="rounded-lg bg-[#15803d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166534]">View</button>
        </form>
      </div>

      <RevenueReportRecipients initialRecipients={config?.dailyRevenueEmails ?? ""} lastSentDate={config?.dailyRevenueLastSentDate ?? null} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric title="ACH cleared" count={clearedToday.length} amount={sum(clearedToday)} detail="Settled today" />
        <Metric title="NSF returns" count={nsfToday.length} amount={sum(nsfToday)} detail="Insufficient funds" tone="red" />
        <Metric title="Other returns" count={otherReturnsToday.length} amount={sum(otherReturnsToday)} detail="Returned ACH" tone="amber" />
        <Metric title="Currently processing" count={inFlight.length} amount={sum(inFlight)} detail="Still in flight" tone="blue" />
        <Metric title="Processed today" count={initiatedToday.length} amount={sum(initiatedToday)} detail="ACH attempts started" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Metric title="Cleared MTD" count={clearedPeriods.mtd.count} amount={clearedPeriods.mtd.amount} detail="Month to date" />
        <Metric title="Cleared YTD" count={clearedPeriods.ytd.count} amount={clearedPeriods.ytd.amount} detail="Year to date" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e7e7e2] bg-white shadow-sm">
        <div className="border-b border-[#eeeee9] px-5 py-4">
          <h2 className="font-semibold text-[#252520]">ACH activity</h2>
          <p className="mt-1 text-xs text-[#85857e]">Amounts show each ACH attempt, including retries and partial collections.</p>
        </div>
        {allRows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#85857e]">No ACH attempts or settlements recorded for this day.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#fafaf8] text-xs uppercase tracking-wide text-[#85857e]"><tr>
                <th className="px-5 py-3 font-medium">Customer</th><th className="px-5 py-3 font-medium">Started (ET)</th><th className="px-5 py-3 font-medium">Settled (ET)</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 text-right font-medium">Amount</th>
              </tr></thead>
              <tbody className="divide-y divide-[#f0f0ec]">{allRows.map((a) => {
                const app = a.payment.application;
                const status = a.finalStatus === "PAID" ? "Cleared" : a.finalStatus === "RETURNED" ? (isNsfReason(a.returnReason) ? "NSF returned" : "Returned") : a.finalStatus ?? "Processing";
                const badge = a.finalStatus === "PAID" ? "bg-emerald-50 text-emerald-700" : a.finalStatus === "RETURNED" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700";
                return <tr key={a.id}>
                  <td className="px-5 py-3"><div className="font-medium text-[#33332e]">{app.firstName} {app.lastName}</div><div className="text-xs text-[#92928b]">{app.applicationCode} · Attempt {a.attemptNumber}</div></td>
                  <td className="px-5 py-3 text-[#55554e]">{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(a.initiatedAt)}</td>
                  <td className="px-5 py-3 text-[#55554e]">{a.settledAt ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(a.settledAt) : "—"}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}>{status}</span>{a.returnReason && <div className="mt-1 max-w-[240px] text-xs text-[#85857e]">{a.returnReason}</div>}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-[#33332e]">{dollars(Number(a.amount))}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs leading-relaxed text-[#888880]">NSF and other returns are grouped by the date their ACH attempt started because the processor history does not store a return timestamp. Cleared amounts use the actual settlement date. Processing includes all attempts without a recorded final status.</p>
    </div>
  );
}
