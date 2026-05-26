import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPortalApplicationId } from "@/lib/portal-auth";
import { StatusBadge } from "@/components/admin/status-badge";
import { PortalLogoutButton } from "./logout-button";
import { getPayoffQuote } from "@/actions/portal-payoff";
import { PayoffCard } from "./payoff-card";
import { getSkipQuote } from "@/actions/portal-skip";
import { SkipCard } from "./skip-card";

export const dynamic = "force-dynamic";

function fmtMoney(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function PortalDashboard() {
  const applicationId = await getPortalApplicationId();
  if (!applicationId) {
    redirect("/portal/login");
  }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      payments: { orderBy: { paymentNumber: "asc" } },
      documents: {
        where: { documentType: "SIGNED_AGREEMENT_PDF" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!app) {
    redirect("/portal/login");
  }

  const fundedAmount = app.fundedAmount ? Number(app.fundedAmount) : Number(app.loanAmount);
  const totalRepay = app.payments.reduce((s, p) => s + Number(p.amount) + Number(p.lateFee), 0);
  const paidPayments = app.payments.filter((p) => p.status === "PAID" || p.paidAt);
  const paidAmount = paidPayments.reduce((s, p) => s + Number(p.amount), 0);
  const remainingAmount = Math.max(totalRepay - paidAmount, 0);
  const nextDue = app.payments.find((p) => p.status !== "PAID" && !p.paidAt);
  const progressPct = app.payments.length > 0 ? Math.round((paidPayments.length / app.payments.length) * 100) : 0;
  const signedAgreement = app.documents[0] || null;
  const [payoffQuote, skipQuote] = await Promise.all([getPayoffQuote(), getSkipQuote()]);

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 lg:px-8 lg:py-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e4e4e7] pb-5 mb-8">
        <span className="text-xl font-bold tracking-tight">
          Penny<span className="text-[#15803d]">Lime<span className="text-[#a3e635]">.</span></span>
        </span>
        <PortalLogoutButton />
      </div>

      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-[28px] font-bold tracking-tight">Hi {app.firstName}.</h1>
        <p className="mt-1 text-sm text-[#71717a]">
          Here's where your cash advance stands. Updated every time we move money.
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-2xl border border-[#e4e4e7] bg-white p-6 lg:p-7 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71717a]">
              Application <span className="font-mono">{app.applicationCode}</span>
            </p>
            <p className="mt-2 text-[36px] font-bold tracking-tight tabular-nums">{fmtMoney(fundedAmount, 0)}</p>
            <p className="mt-1 text-sm text-[#52525b]">Cash advance</p>
          </div>
          <StatusBadge status={app.status} offerStatus={app.offerStatus} />
        </div>

        {app.payments.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-[12px] mb-1.5">
              <span className="text-[#71717a]">
                {paidPayments.length} of {app.payments.length} payments
              </span>
              <span className="text-[#71717a] tabular-nums">{progressPct}% paid</span>
            </div>
            <div className="h-2 bg-[#f4f4f5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#15803d] rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Paid" value={fmtMoney(paidAmount)} accent />
              <Stat label="Remaining" value={fmtMoney(remainingAmount)} />
              <Stat label="Total" value={fmtMoney(totalRepay)} />
              <Stat
                label="Next due"
                value={nextDue ? fmtDate(nextDue.dueDate) : "—"}
                sub={nextDue ? fmtMoney(Number(nextDue.amount)) : "All paid off"}
              />
            </div>
          </div>
        )}
      </div>

      {/* Early payoff card — only if there is something left to pay off */}
      {payoffQuote.ok ? <PayoffCard quote={payoffQuote} /> : null}

      {/* Skip-a-payment card — only when eligible (has a pending payment + hasn't used skip yet) */}
      {skipQuote.ok ? <SkipCard quote={skipQuote} /> : null}

      {/* Actions strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {signedAgreement ? (
          <a
            href="/api/portal/agreement"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-[#15803d] bg-[#f0fdf4] p-4 hover:bg-[#dcfce7] transition-colors"
          >
            <div>
              <div className="text-[13px] font-semibold text-[#15803d]">Your signed contract</div>
              <div className="text-[11px] text-[#15803d]/70 font-mono mt-0.5">{signedAgreement.fileName}</div>
            </div>
            <svg className="h-5 w-5 text-[#15803d]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </a>
        ) : null}
        <a
          href="mailto:info@pennylime.com"
          className="flex items-center justify-between rounded-xl border border-[#e4e4e7] bg-white p-4 hover:bg-[#fafafa] transition-colors"
        >
          <div>
            <div className="text-[13px] font-semibold text-[#0a0a0a]">Need help?</div>
            <div className="text-[11px] text-[#71717a] mt-0.5">Email info@pennylime.com</div>
          </div>
          <svg className="h-5 w-5 text-[#71717a]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </a>
      </div>

      {/* Repayment schedule */}
      {app.payments.length > 0 && (
        <div className="rounded-2xl border border-[#e4e4e7] bg-white overflow-hidden">
          <div className="px-5 lg:px-7 py-4 border-b border-[#e4e4e7]">
            <h2 className="text-[15px] font-bold tracking-tight">Repayment schedule</h2>
            <p className="mt-0.5 text-[12px] text-[#71717a]">
              Auto-debited from your linked bank account on each due date.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafafa]">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">#</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Due date</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Amount</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Status</th>
                </tr>
              </thead>
              <tbody>
                {app.payments.map((p) => {
                  const isPaid = p.status === "PAID" || !!p.paidAt;
                  const lateFee = Number(p.lateFee);
                  return (
                    <tr key={p.id} className="border-t border-[#f4f4f5]">
                      <td className="px-5 py-3 font-semibold tabular-nums">{p.paymentNumber}</td>
                      <td className="px-5 py-3">
                        {fmtDate(p.dueDate)}
                        {p.paidAt ? (
                          <div className="text-[11px] text-[#15803d]">paid {fmtDate(p.paidAt)}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium">
                        {fmtMoney(Number(p.amount))}
                        {lateFee > 0 ? <div className="text-[11px] text-[#b45309]">+ {fmtMoney(lateFee)} late fee</div> : null}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <PortalPaymentPill status={p.status} isPaid={isPaid} dueDate={p.dueDate} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-10 pt-6 border-t border-[#e4e4e7] text-[11px] text-[#a1a1aa]">
        <p>
          PennyLime · 770 Technology Way LLC · This is a merchant cash advance.{" "}
          <a href="/terms" className="text-[#15803d] hover:underline">Terms</a> ·{" "}
          <a href="/privacy" className="text-[#15803d] hover:underline">Privacy</a>
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${accent ? "bg-[#f0fdf4]" : "bg-[#fafaf7]"}`}>
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#71717a]">{label}</div>
      <div className={`mt-1 text-[16px] font-bold tabular-nums ${accent ? "text-[#15803d]" : "text-[#0a0a0a]"}`}>{value}</div>
      {sub ? <div className="text-[11px] text-[#52525b] mt-0.5">{sub}</div> : null}
    </div>
  );
}

function PortalPaymentPill({ status, isPaid, dueDate }: { status: string; isPaid: boolean; dueDate: Date }) {
  if (isPaid || status === "PAID") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0fdf4] text-[#15803d] text-[11px] font-semibold px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]" />
        Paid
      </span>
    );
  }
  if (status === "PROCESSING") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
        Processing
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 text-[11px] font-semibold px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
        Failed
      </span>
    );
  }
  const isLate = new Date(dueDate).getTime() < Date.now();
  if (isLate) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 text-[11px] font-semibold px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
        Late
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 text-stone-600 text-[11px] font-semibold px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
      Upcoming
    </span>
  );
}
