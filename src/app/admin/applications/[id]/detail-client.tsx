"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  updateTotalIncome,
  rejectApplication,
  revealSSN,
} from "@/actions/applications";
import { evaluateApplicationAction } from "@/actions/evaluation";
import { PlaidInsightsPanel } from "@/components/admin/plaid-insights-panel";
import { IncomeByPlatformPanel } from "@/components/admin/income-by-platform-panel";
import { SetOfferTermsForm } from "@/components/admin/set-offer-terms-form";
import { PaymentScheduleCard } from "@/components/admin/payment-schedule-card";
import type { OfferTerm } from "@/actions/offers";
import { getPaymentsSummary, retryPayment, waiveLateFee, chargePaymentNow, sendMissedPaymentNotice } from "@/actions/payments";
import { uploadBankStatements, setVerifiedMonthlyIncome, parseBankStatementsWithAI, deleteBankStatement, deleteApplicationDocument } from "@/actions/bank-statements";
import { runAiRiskAnalysis, getAiRiskAnalysis } from "@/actions/risk";
import type { AiRiskAnalysis } from "@/lib/risk/ai-risk";
import { generateSignedAgreementPdf } from "@/actions/signed-agreement";
import { cancelSignedAgreement } from "@/actions/cancel-contract";
import { StatusBadge } from "@/components/admin/status-badge";
import { previewPortalAs } from "@/actions/portal-preview";
import type { ApplicationWithDocuments } from "@/types";
import type { EvaluationResult } from "@/types";
import type { CustomerCrm } from "@/components/admin/customer-crm-panel";
import { SalesforceRecord } from "@/components/admin/sf-record";

/* ── helpers ── */

/**
 * Pre-canned rejection reasons. The `label` is what the admin sees in
 * the dropdown; the `reason` is what gets sent to the applicant in
 * the rejection email + saved on the audit log. "Other" lets the
 * admin write a custom reason in the free-text fallback.
 */
const REJECT_REASONS: Array<{ value: string; label: string; reason: string }> = [
  {
    value: "income-consistency",
    label: "Income too irregular",
    reason: "After reviewing your application, we're unable to approve the cash advance at this time. Our underwriting requires a track record of consistent weekly income, and the deposits on file are too irregular for us to confidently project repayment. We'd encourage you to reapply in 3 to 6 months once you have a steadier deposit pattern.",
  },
  {
    value: "insufficient-income",
    label: "Income too low for amount requested",
    reason: "We're unable to approve the amount you requested at this time. The advance works out to a weekly remittance that's outside our affordability range based on your verified weekly income. We'd be happy to reconsider a smaller advance.",
  },
  {
    value: "account-balance",
    label: "Account balance too low / NSF risk",
    reason: "Thank you for applying. After reviewing your bank activity, we're unable to approve the advance at this time. Our underwriting looks for a consistent weekly income pattern and stable bank balances, and the current account activity doesn't meet that threshold. You're welcome to reapply in 60 to 90 days.",
  },
  {
    value: "time-on-platform",
    label: "Not enough history (new gig worker)",
    reason: "We need at least 60 to 90 days of consistent platform earnings to underwrite an advance. Your account shows promising activity but doesn't yet have enough history for us to verify. Please reapply once you have a longer track record.",
  },
  {
    value: "concurrent-debt",
    label: "Existing MCA / lender debits detected",
    reason: "After reviewing your bank statements, we noticed regular debits to other lenders. Our policy is to wait until those obligations are paid down before extending additional advances. You're welcome to reapply once they're settled.",
  },
  {
    value: "identity",
    label: "Identity verification mismatch",
    reason: "We weren't able to verify your identity against the bank account you linked. If you'd like to reapply, please make sure the name on your application matches the name on the bank account.",
  },
  {
    value: "general",
    label: "General (no specific reason)",
    reason: "After reviewing your application and bank activity, we're unable to approve the advance at this time. Our underwriting decision was based on income consistency and account balance trends over the last 90 days. You're welcome to reapply in 60 days.",
  },
  {
    value: "other",
    label: "Other (write custom)",
    reason: "",
  },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// StatusBadge moved to @/components/admin/status-badge so every place
// in the admin (table, detail header, contacts, dashboard) shows the
// same colors + labels and stays in lockstep when statuses are added.

function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    APPROVE:       { bg: "bg-[#f0f5f0]", text: "text-[#15803d]" },
    REJECT:        { bg: "bg-[#fff1f2]", text: "text-[#dc2626]" },
    MANUAL_REVIEW: { bg: "bg-[#fef9ec]", text: "text-[#b45309]" },
  };
  const s = map[recommendation] ?? map.MANUAL_REVIEW;
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${s.bg} ${s.text}`}>
      {recommendation.replace("_", " ")}
    </span>
  );
}

/* ── main component ── */

type AchAuthSnapshot = {
  id: string;
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  bankName: string | null;
  bankAccountMask: string | null;
  totalDebitAmount: number;
  authorizationText: string;
  agreementVersion: string | null;
  signedName: string | null;
  scrolledToBottom: boolean;
  schedule: Array<{
    paymentNumber: number;
    date: string;
    amount: number;
    principal: number;
    interest: number;
  }>;
};

export function DetailClient({
  application,
  achAuth,
  fromTab = null,
  prevId = null,
  nextId = null,
  position = null,
  crm = null,
}: {
  application: ApplicationWithDocuments;
  achAuth?: AchAuthSnapshot | null;
  fromTab?: string | null;
  prevId?: string | null;
  nextId?: string | null;
  position?: { index: number; total: number } | null;
  crm?: (CustomerCrm & { email: string | null; phone: string | null }) | null;
}) {
  const router = useRouter();
  const fromQs = fromTab ? `?from=${encodeURIComponent(fromTab)}` : "";
  const backHref = `/admin/applications${fromQs}`;

  /* evaluation */
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

  useEffect(() => {
    evaluateApplicationAction(application.id).then((evalResult) => {
      setEvaluation(evalResult);
    });
  }, [application.id]);

  /* AI risk analysis — persisted on the Application, fetched on mount,
     re-run on demand. */
  const [aiRisk, setAiRisk] = useState<AiRiskAnalysis | null>(null);
  const [aiRiskLoading, setAiRiskLoading] = useState(false);
  useEffect(() => {
    getAiRiskAnalysis(application.id).then((r) => setAiRisk(r ?? null));
  }, [application.id]);

  async function handleRunAiRisk() {
    setAiRiskLoading(true);
    try {
      const r = await runAiRiskAnalysis(application.id);
      if (r.ok) {
        setAiRisk(r.analysis);
        toast.success("AI risk analysis complete.");
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAiRiskLoading(false);
    }
  }

  /* payments */
  const [paymentSummary, setPaymentSummary] = useState<Awaited<ReturnType<typeof getPaymentsSummary>> | null>(null);

  useEffect(() => {
    // FUNDED = ACH credit went out but no repayments yet (the moment after
    // disbursement). REPAYING = at least one weekly debit posted. Both
    // should show the schedule so admins can hit "Charge now" on the first
    // pending payment without waiting for the daily cron.
    if (["FUNDED", "ACTIVE", "REPAYING", "LATE", "COLLECTIONS", "DEFAULTED", "PAID_OFF"].includes(application.status)) {
      getPaymentsSummary(application.id).then(setPaymentSummary);
    }
  }, [application.id, application.status]);

  /* Auto-refresh while a payment is in flight.
     Re-reading the DB alone won't help — the DB only updates when
     something polls Increase. So for each PROCESSING row we call
     refreshPaymentStatus (the same action behind the manual Refresh
     button) which hits Increase + writes back the latest status,
     then re-reads the summary. */
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);

  async function syncFromIncrease(): Promise<{ updated: number; total: number }> {
    if (!paymentSummary) return { updated: 0, total: 0 };
    const inflightIds = paymentSummary.payments
      .filter((p) => p.status === "PROCESSING")
      .map((p) => p.id);
    if (inflightIds.length === 0) return { updated: 0, total: 0 };
    setSyncingNow(true);
    try {
      const { refreshPaymentStatus } = await import("@/actions/refresh-payment-status");
      const results = await Promise.all(
        inflightIds.map((id) => refreshPaymentStatus(id).catch(() => null)),
      );
      const fresh = await getPaymentsSummary(application.id);
      setPaymentSummary(fresh);
      setLastSyncAt(Date.now());
      const updated = results.filter((r): r is { ok: true; status: string; transferStatus: string } =>
        !!r && r.ok && (r.status === "PAID" || r.status === "RETURNED"),
      ).length;
      return { updated, total: inflightIds.length };
    } finally {
      setSyncingNow(false);
    }
  }

  useEffect(() => {
    if (!paymentSummary) return;
    const hasInflight = paymentSummary.payments.some((p) => p.status === "PROCESSING");
    if (!hasInflight) return;
    let cancelled = false;
    // Fire one sync immediately on mount so the user sees activity
    // right away, then keep polling every 20s.
    void syncFromIncrease().catch(() => null);
    const handle = setInterval(() => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      void syncFromIncrease().catch(() => null);
    }, 20_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [application.id, paymentSummary?.payments.length]);

  /* SSN reveal */
  const [ssn, setSsn] = useState<string | null>(null);
  const [ssnLoading, setSsnLoading] = useState(false);

  async function handleRevealSSN() {
    setSsnLoading(true);
    try {
      const result = await revealSSN(application.id);
      if (result.success && result.ssn) {
        setSsn(result.ssn);
      } else {
        toast.error(result.error || "Failed to reveal SSN");
      }
    } catch {
      toast.error("Failed to reveal SSN");
    } finally {
      setSsnLoading(false);
    }
  }

  // Plaid data is rendered by PlaidInsightsPanel below; refresh triggers
  // window.location.reload there so server-side cached fields update.

  /* income */
  const [income, setIncome] = useState(
    application.totalIncome ? String(Number(application.totalIncome)) : ""
  );
  const [savingIncome, setSavingIncome] = useState(false);

  /* decision — rejection path only; approval is via "Set offer terms" */
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectReasonKey, setRejectReasonKey] = useState<string>("");
  const [customRejectionReason, setCustomRejectionReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  /* derived values */
  const requestedAmount = Number(application.loanAmount);
  const totalIncome = application.totalIncome ? Number(application.totalIncome) : null;

  // Resolve the actual deal numbers from the offer state.
  //   - The borrower picks an amount on the offer page slider (anywhere
  //     within the min/max we approved). What they pick = acceptedAmount.
  //   - The Fund input + admin headline use that exact number.
  //   - Before acceptance: show the approved max (what's currently being
  //     offered) since the borrower hasn't chosen yet.
  const offerTerms: Array<{
    weeklyRemittance: number;
    durationWeeks: number;
    disbursedAmount: number;
    totalCostOfCapital: number;
    processingFee: number;
    isRecommended: boolean;
  }> = (() => {
    try {
      return application.offeredTermsJson ? JSON.parse(application.offeredTermsJson) : [];
    } catch {
      return [];
    }
  })();
  const recommendedTerm =
    offerTerms.find((t) => t.isRecommended) ?? offerTerms[0] ?? null;
  const acceptedAmount = application.acceptedAmount ? Number(application.acceptedAmount) : null;
  const offeredMax = application.offeredMaxAmount ? Number(application.offeredMaxAmount) : null;
  const effectiveAmount = acceptedAmount ?? offeredMax ?? requestedAmount;

  /* funding */
  const [funding, setFunding] = useState(false);
  const [fundAmount, setFundAmount] = useState(String(effectiveAmount));
  const displayTermWeeks = recommendedTerm?.durationWeeks ?? null;
  // Back-derive the weekly compound rate from any saved plan so the
  // admin sees what rate the borrower is being offered. Uses the
  // identity: total / principal = (1 + r)^weeks.
  const derivedWeeklyRate = (() => {
    if (!recommendedTerm) return null;
    const { weeklyRemittance, durationWeeks, disbursedAmount } = recommendedTerm;
    if (disbursedAmount <= 0 || durationWeeks <= 0 || weeklyRemittance <= 0) return null;
    const total = weeklyRemittance * durationWeeks;
    const ratio = total / disbursedAmount;
    if (ratio <= 1) return 0;
    const rate = Math.pow(ratio, 1 / durationWeeks) - 1;
    return Math.round(rate * 10000) / 100; // e.g. 5.00
  })();

  /* ── handlers ── */

  async function handleSaveIncome() {
    const value = parseFloat(income);
    if (isNaN(value) || value <= 0) {
      toast.error("Please enter a valid income amount");
      return;
    }
    setSavingIncome(true);
    try {
      await updateTotalIncome(application.id, value);
      toast.success("Income saved successfully");
      router.refresh();
    } catch {
      toast.error("Failed to save income");
    } finally {
      setSavingIncome(false);
    }
  }

  async function handleReject() {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setRejecting(true);
    try {
      const result = await rejectApplication(application.id, rejectionReason);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Application rejected");
        setShowRejectForm(false);
        router.refresh();
      }
    } catch {
      toast.error("Failed to reject application");
    } finally {
      setRejecting(false);
    }
  }

  async function handleFund() {
    setFunding(true);
    try {
      // fundApplication may not exist yet, we call it if available
      const { fundApplication } = await import("@/actions/applications");
      if (typeof fundApplication === "function") {
        const result = await fundApplication(application.id, parseFloat(fundAmount));
        if ((result as any).error) {
          toast.error((result as any).error);
        } else {
          toast.success("Advance marked as funded");
          router.refresh();
        }
      } else {
        toast.error("Fund action not yet available");
      }
    } catch {
      toast.error("Fund action not yet available");
    } finally {
      setFunding(false);
    }
  }

  /* ── render ── */

  return (
    <div className="min-h-screen bg-[#f8faf8]">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              {fromTab && fromTab !== "All" ? `Back to ${fromTab}` : "Back to list"}
            </Link>
            {/* Step through the list without returning to it */}
            <div className="flex items-center gap-1.5">
              <Link
                href={prevId ? `/admin/applications/${prevId}${fromQs}` : "#"}
                aria-disabled={!prevId}
                className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 bg-white transition-colors ${prevId ? "text-gray-700 hover:bg-gray-50" : "text-gray-300 pointer-events-none"}`}
                title="Previous"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </Link>
              {position && (
                <span className="text-xs font-medium text-[#a1a1aa] tabular-nums px-1 min-w-[52px] text-center">
                  {position.index} / {position.total}
                </span>
              )}
              <Link
                href={nextId ? `/admin/applications/${nextId}${fromQs}` : "#"}
                aria-disabled={!nextId}
                className={`inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 bg-white transition-colors ${nextId ? "text-gray-700 hover:bg-gray-50" : "text-gray-300 pointer-events-none"}`}
                title="Next"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </Link>
            </div>
            <div>
              <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">
                {application.firstName} {application.lastName}
              </h1>
              <p className="text-sm text-[#a1a1aa] mt-0.5">Review and analyze advance application</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                toast.loading("Signing into portal...", { id: "portal-preview" });
                const r = await previewPortalAs(application.id);
                toast.dismiss("portal-preview");
                if (r.ok) {
                  toast.success(`Previewing as ${r.firstName}`);
                  window.open("/portal", "_blank", "noopener,noreferrer");
                } else {
                  toast.error(r.error || "Failed to start preview");
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#15803d] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#15803d] hover:bg-[#f0fdf4] transition-colors"
              title="Sign into the customer portal as this applicant - opens in a new tab"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              View as customer
            </button>
            <StatusBadge status={application.status} offerStatus={application.offerStatus} />
          </div>
        </div>

        <div className="space-y-6">
          {/* ── Customer CRM — Salesforce Lightning-style record ── */}
          {crm && (
            <SalesforceRecord
              crm={crm}
              applicant={{
                firstName: application.firstName,
                lastName: application.lastName,
                applicationCode: application.applicationCode,
                status: application.status,
                loanAmount: Number(application.loanAmount),
                fundedAmount:
                  application.fundedAmount != null
                    ? Number(application.fundedAmount)
                    : null,
              }}
            />
          )}

          {/* ── Income by platform (from bank statement) ── */}
          <IncomeByPlatformPanel
            applicationId={application.id}
            json={(application as any).incomeByPlatformJson ?? null}
          />

          {/* ── Evaluation Card ── */}
          {evaluation && (
            <div className="bg-white rounded-[10px] p-6">
              <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black mb-4 flex items-center gap-2">
                <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                Rules Engine Evaluation
              </h2>

              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-medium text-black">Recommendation:</span>
                <RecommendationBadge recommendation={evaluation.recommendation} />
              </div>

              {evaluation.suggestedRate > 0 && (
                <div className="mb-4">
                  <span className="text-sm text-[#a1a1aa]">Suggested weekly rate: </span>
                  <span className="text-sm font-bold text-black">{evaluation.suggestedRate}%</span>
                  <span className="text-sm text-[#a1a1aa]"> / week (compounded)</span>
                </div>
              )}

              {evaluation.reasons.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-black mb-2">Reasons:</p>
                  <ul className="space-y-1">
                    {evaluation.reasons.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-black">
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#a1a1aa] shrink-0" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Applicant Info ── */}
          <div className="bg-white rounded-[10px] p-6">
            <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black mb-5 flex items-center gap-2">
              <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              Applicant Information
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Full Name</p>
                <p className="mt-1 text-sm font-semibold text-black">
                  {application.firstName} {application.lastName}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Email</p>
                <p className="mt-1 text-sm text-black">{application.email}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Phone</p>
                <p className="mt-1 text-sm text-black">{application.phone}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Application Code</p>
                <p className="mt-1 text-sm font-mono font-semibold text-[#15803d] bg-[#f0f5f0] rounded-lg px-2.5 py-1 inline-block">
                  {application.applicationCode}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">
                  {acceptedAmount
                    ? "Accepted Amount"
                    : offeredMax
                    ? "Offered (up to)"
                    : "Requested Amount"}
                </p>
                <p className="mt-1 text-2xl font-bold text-[#15803d]">
                  ${fmt(effectiveAmount)}
                </p>
                {acceptedAmount && offeredMax && acceptedAmount !== offeredMax && (
                  <p className="mt-0.5 text-[11px] text-[#71717a]">
                    Approved up to ${fmt(offeredMax)} · borrower chose ${fmt(acceptedAmount)}
                  </p>
                )}
                {!acceptedAmount && offeredMax && offeredMax !== requestedAmount && (
                  <p className="mt-0.5 text-[11px] text-[#71717a]">
                    Originally requested ${fmt(requestedAmount)}
                  </p>
                )}
                {derivedWeeklyRate != null && (
                  <p className="mt-0.5 text-[11px] text-[#52525b]">
                    @ <span className="font-semibold text-[#0a0a0a]">{derivedWeeklyRate}%</span> / week compounded
                  </p>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Submitted</p>
                <p className="mt-1 text-sm text-black">
                  {new Date(application.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>

              {/* Platform, Term, Bank Link Status, SSN */}
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Platform</p>
                <p className="mt-1 text-sm text-black">{(application as any).platform || "N/A"}</p>
              </div>
              {(application as any).businessType && (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Business type</p>
                  <p className="mt-1 text-sm text-black">{(application as any).businessType}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Term</p>
                <p className="mt-1 text-sm text-black">
                  {displayTermWeeks
                    ? `${displayTermWeeks} weeks${recommendedTerm?.isRecommended ? " (recommended)" : ""}`
                    : `${(application as any).loanTermMonths ?? "N/A"} weeks (requested)`}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Bank Link Status</p>
                <p className="mt-1 text-sm">
                  {(application as any).plaidAccessToken ? (
                    <span className="inline-flex items-center gap-1 text-[#15803d] font-semibold">
                      <span className="h-2 w-2 rounded-full bg-[#15803d]" />
                      Linked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[#a1a1aa]">
                      <span className="h-2 w-2 rounded-full bg-[#a1a1aa]" />
                      Not linked
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">SSN</p>
                <div className="mt-1">
                  {ssn ? (
                    <p className="text-sm font-mono font-semibold text-black">{ssn}</p>
                  ) : (
                    <button
                      onClick={handleRevealSSN}
                      disabled={ssnLoading}
                      className="text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8] underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {ssnLoading ? "Revealing..." : "Reveal SSN"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {application.status === "REJECTED" && application.rejectionReason && (
              <div className="mt-5 rounded-lg bg-[#fff1f2] p-4">
                <p className="text-sm font-semibold text-[#dc2626]">Rejection Reason</p>
                <p className="mt-1 text-sm text-[#dc2626]">{application.rejectionReason}</p>
              </div>
            )}
          </div>

          {/* ── Traffic Source ── */}
          <TrafficSourceCard contact={(application as any).contact} />

          {/* ── Prior advances (repeat-applicant context) ── */}
          <PriorAdvancesCard priorAdvances={(application as any).priorAdvances ?? []} />

          {/* ── Offer terms ── */}
          {(() => {
            const a = application as any;
            let parsedTerms: OfferTerm[] = [];
            try {
              parsedTerms = a.offeredTermsJson ? JSON.parse(a.offeredTermsJson) : [];
            } catch {
              parsedTerms = [];
            }
            return (
              <SetOfferTermsForm
                applicationId={application.id}
                existing={{
                  status: a.offerStatus ?? "PENDING",
                  minAmount: a.offeredMinAmount != null ? Number(a.offeredMinAmount) : null,
                  maxAmount: a.offeredMaxAmount != null ? Number(a.offeredMaxAmount) : null,
                  terms: parsedTerms,
                  offerToken: a.offerToken ?? null,
                  applicationCode: application.applicationCode,
                  // Borrower's requested amount from the apply form. Caps
                  // the default offered max so we never accidentally
                  // offer more than they asked for.
                  requestedAmount: application.loanAmount != null ? Number(application.loanAmount) : null,
                }}
              />
            );
          })()}

          {/* ── Plaid Insights ── */}
          <PlaidInsightsPanel
            application={{
              id: application.id,
              plaidAccessToken: (application as any).plaidAccessToken ?? null,
              plaidLinkStale: (application as any).plaidLinkStale ?? false,
              monthlyIncome: (application as any).monthlyIncome != null ? Number((application as any).monthlyIncome) : null,
              avgWeeklyIncome: (application as any).avgWeeklyIncome != null ? Number((application as any).avgWeeklyIncome) : null,
              depositCount90d: (application as any).depositCount90d ?? null,
              largestDeposit: (application as any).largestDeposit != null ? Number((application as any).largestDeposit) : null,
              depositCadence: (application as any).depositCadence ?? null,
              bankBalance: (application as any).bankBalance != null ? Number((application as any).bankBalance) : null,
              availableBalance: (application as any).availableBalance != null ? Number((application as any).availableBalance) : null,
              plaidInstitutionName: (application as any).plaidInstitutionName ?? null,
              plaidAccountName: (application as any).plaidAccountName ?? null,
              plaidAccountMask: (application as any).plaidAccountMask ?? null,
              plaidAccountSubtype: (application as any).plaidAccountSubtype ?? null,
              plaidIdentityName: (application as any).plaidIdentityName ?? null,
              plaidIdentityAddress: (application as any).plaidIdentityAddress ?? null,
              plaidIdentityEmail: (application as any).plaidIdentityEmail ?? null,
              plaidIdentityPhone: (application as any).plaidIdentityPhone ?? null,
              identityNeedsReview: (application as any).identityNeedsReview ?? false,
              lastPlaidRefresh: (application as any).lastPlaidRefresh
                ? new Date((application as any).lastPlaidRefresh).toISOString()
                : null,
              formFirstName: application.firstName,
              formLastName: application.lastName,
              formEmail: application.email,
              formPhone: application.phone,
            }}
          />

          {/* ── Documents ── */}
          <DocumentsPanel
            applicationId={application.id}
            documents={application.documents}
            onDelete={async (id, name) => {
              if (!confirm(`Delete ${name}?`)) return;
              const r = await deleteApplicationDocument(id);
              if (r.ok) {
                toast.success("Deleted");
                router.refresh();
              } else {
                toast.error(r.error);
              }
            }}
            onRegenerateSignedAgreement={async () => {
              toast.loading("Regenerating contract PDF...", { id: "regen-agreement" });
              const r = await generateSignedAgreementPdf(application.id);
              toast.dismiss("regen-agreement");
              if (r.ok) {
                toast.success("Contract PDF regenerated");
                router.refresh();
              } else {
                toast.error(r.error || "Failed to regenerate");
              }
            }}
          />

          {/* ── ACH Authorization Proof (when customer has accepted) ── */}
          {achAuth && (
            <div className="bg-white rounded-[10px] border-2 border-[#15803d] p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
                    <svg className="h-5 w-5 text-[#15803d]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    ACH Authorization (signed)
                  </h2>
                  <p className="text-[11px] text-[#71717a] mt-0.5">
                    Customer's electronic signature for ACH debit. Legal evidence if a debit is ever disputed.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <SignedAgreementPdfButton applicationId={application.id} />
                  <CancelSignedAgreementButton
                    applicationId={application.id}
                    wasFunded={!!application.fundedAt}
                    canceledAmount={Number(application.acceptedAmount ?? 0)}
                  />
                  <span className="text-[10px] font-mono text-[#a1a1aa]">ID: {achAuth.id.slice(0, 8)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] mb-4 pt-3 border-t border-[#f4f4f5]">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#a1a1aa]">Accepted at</p>
                  <p className="font-mono text-[#0a0a0a]">{new Date(achAuth.acceptedAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#a1a1aa]">IP address</p>
                  <p className="font-mono text-[#0a0a0a]">{achAuth.ipAddress ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#a1a1aa]">Bank</p>
                  <p className="text-[#0a0a0a]">
                    {achAuth.bankName ?? "—"}
                    {achAuth.bankAccountMask ? ` ending in ${achAuth.bankAccountMask}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#a1a1aa]">Total authorized</p>
                  <p className="font-bold text-[#0a0a0a]">${achAuth.totalDebitAmount.toFixed(2)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#a1a1aa]">Agreement version</p>
                  <p className="font-mono text-[#0a0a0a]">{achAuth.agreementVersion ?? "—"}</p>
                </div>
                {achAuth.userAgent && (
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase tracking-wider text-[#a1a1aa]">User agent</p>
                    <p className="font-mono text-[10px] text-[#52525b] break-all">{achAuth.userAgent}</p>
                  </div>
                )}
              </div>

              {/* Typed-name signature + scroll-to-end confirmation. */}
              {(achAuth.signedName || achAuth.scrolledToBottom) && (
                <div className="bg-[#f7fbf8] border border-[#bbf7d0] rounded-lg p-4 mb-4">
                  <p className="text-[10px] uppercase tracking-wider text-[#15803d] mb-2 font-bold">
                    Electronic signature
                  </p>
                  {achAuth.signedName && (
                    <p
                      className="text-[28px] leading-tight text-[#0a0a0a] mb-1"
                      style={{ fontFamily: "var(--font-caveat), 'Caveat', 'Brush Script MT', cursive" }}
                    >
                      {achAuth.signedName}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-[11px] text-[#52525b]">
                    {achAuth.scrolledToBottom ? (
                      <span className="inline-flex items-center gap-1 text-[#15803d] font-semibold">
                        ✓ Scrolled agreement to end
                      </span>
                    ) : (
                      <span className="text-[#a16207]">Scroll-to-end not confirmed</span>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-[#fafafa] border border-[#e4e4e7] rounded-lg p-3 text-[12px] leading-relaxed text-[#52525b] mb-4">
                <p className="text-[10px] uppercase tracking-wider text-[#a1a1aa] mb-1.5">Exact text shown to customer</p>
                {achAuth.authorizationText}
              </div>

              <details className="text-[12px]">
                <summary className="cursor-pointer text-[#15803d] font-semibold hover:underline">
                  View signed schedule ({achAuth.schedule.length} payments)
                </summary>
                <div className="mt-3 rounded-lg border border-[#e4e4e7] overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead className="bg-[#fafafa]">
                      <tr>
                        <th className="text-left px-3 py-1.5">#</th>
                        <th className="text-left px-3 py-1.5">Date</th>
                        <th className="text-right px-3 py-1.5">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {achAuth.schedule.map((p) => (
                        <tr key={p.paymentNumber} className="border-t border-[#f4f4f5]">
                          <td className="px-3 py-1.5">{p.paymentNumber}</td>
                          <td className="px-3 py-1.5">{p.date}</td>
                          <td className="px-3 py-1.5 text-right font-semibold">${p.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}

          {/* ── Bank Statements + Verified Income ── */}
          <BankStatementsPanel
            applicationId={application.id}
            documents={application.documents}
            currentMonthlyIncome={
              application.monthlyIncome != null ? Number(application.monthlyIncome) : null
            }
            onChange={() => router.refresh()}
          />

          {/* ── Income Entry ── */}
          <div className="bg-white rounded-[10px] p-6">
            <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black mb-4 flex items-center gap-2">
              <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Income Entry
            </h2>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor="income" className="block text-sm font-medium text-black mb-1.5">
                  Total 3-Month Income (from pay stubs)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-sm font-medium">
                    $
                  </span>
                  <input
                    id="income"
                    type="number"
                    placeholder="0.00"
                    value={income}
                    onChange={(e) => setIncome(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-4 py-2.5 text-sm text-black placeholder:text-[#a1a1aa] focus:border-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveIncome}
                disabled={savingIncome}
                className="bg-[#1a1a1a] text-white rounded-lg px-6 py-2.5 font-semibold text-sm disabled:opacity-50 disabled:pointer-events-none transition-colors hover:bg-black"
              >
                {savingIncome ? "Saving..." : "Save Income"}
              </button>
            </div>

            {totalIncome !== null && (
              <p className="mt-2.5 text-xs text-[#a1a1aa]">
                Current recorded income:{" "}
                <span className="font-semibold text-[#15803d]">${fmt(totalIncome)}</span>
              </p>
            )}
          </div>

          {/* ── AI Risk Analysis ──
              Replaces the old statistical risk-model card. Reads the
              applicant's Plaid Assets + AI-parsed bank statements and
              calls Gemini for a structured underwriting verdict. */}
          <div className="bg-white rounded-[10px] p-6">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div>
                <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
                  <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                  </svg>
                  AI Risk Analysis
                </h2>
                <p className="text-[11px] text-[#71717a] mt-0.5">
                  Gemini-powered underwriting on Plaid Assets + parsed bank statements.
                  {aiRisk?.generatedAt && (
                    <> Last run: <span className="font-mono">{new Date(aiRisk.generatedAt).toLocaleString()}</span></>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunAiRisk}
                disabled={aiRiskLoading}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] text-white text-[12px] font-semibold px-3 py-2 hover:bg-[#166534] disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                {aiRiskLoading ? "Analyzing…" : aiRisk ? "Re-run analysis" : "Run AI risk analysis"}
              </button>
            </div>

            {!aiRisk && !aiRiskLoading && (
              <div className="rounded-lg bg-[#fafafa] border border-dashed border-[#e4e4e7] p-6 text-center">
                <p className="text-[13px] text-[#71717a]">
                  No AI analysis run yet. Click <span className="font-semibold">"Run AI risk analysis"</span> to underwrite this applicant based on their verified income, deposits, and bank context.
                </p>
              </div>
            )}

            {aiRisk && (
              <div className="space-y-4">
                {/* Headline numbers */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-[#f8faf8] p-4 text-center">
                    <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold mb-1">Risk Score</p>
                    <p className={`text-3xl font-bold ${
                      aiRisk.riskScore < 33 ? "text-[#15803d]" :
                      aiRisk.riskScore < 66 ? "text-[#b45309]" :
                      "text-[#dc2626]"
                    }`}>
                      {aiRisk.riskScore.toFixed(0)}
                    </p>
                    <p className="text-xs text-[#a1a1aa] mt-1">/ 100 (higher = riskier)</p>
                  </div>
                  <div className="rounded-lg bg-[#f8faf8] p-4 text-center">
                    <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold mb-1">Recommended Rate</p>
                    <p className="text-3xl font-bold text-black">{aiRisk.recommendedWeeklyRate.toFixed(1)}%</p>
                    <p className="text-xs text-[#a1a1aa] mt-1">per week, compound</p>
                  </div>
                  <div className="rounded-lg bg-[#f8faf8] p-4 text-center">
                    <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold mb-1">Verdict</p>
                    <p className={`text-lg font-bold ${
                      aiRisk.verdict === "APPROVE" ? "text-[#15803d]" :
                      aiRisk.verdict === "MANUAL_REVIEW" ? "text-[#b45309]" :
                      "text-[#dc2626]"
                    }`}>
                      {aiRisk.verdict.replace("_", " ")}
                    </p>
                    <p className="text-xs text-[#a1a1aa] mt-1">confidence: {aiRisk.confidence}</p>
                  </div>
                </div>

                {/* Recommended max amount */}
                {aiRisk.recommendedMaxAmount > 0 && (
                  <div className="rounded-lg bg-[#f0fdf4] border border-[#dcfce7] p-3">
                    <p className="text-[12px] text-[#15803d]">
                      <span className="font-semibold">Recommended max approval:</span>{" "}
                      <span className="font-bold">${aiRisk.recommendedMaxAmount.toLocaleString("en-US", { minimumFractionDigits: 0 })}</span>
                      {" "}— use this as the "Max approved amount" in Set offer terms.
                    </p>
                  </div>
                )}

                {/* Summary */}
                <div className="rounded-lg bg-[#fafafa] border border-[#e4e4e7] p-4">
                  <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-semibold mb-1.5">Summary</p>
                  <p className="text-[13px] text-[#0a0a0a] leading-relaxed">{aiRisk.summary}</p>
                </div>

                {/* Green / red flags */}
                {(aiRisk.greenFlags.length > 0 || aiRisk.redFlags.length > 0) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {aiRisk.greenFlags.length > 0 && (
                      <div className="rounded-lg bg-[#f0fdf4] border border-[#dcfce7] p-3">
                        <p className="text-[11px] uppercase tracking-[0.05em] text-[#15803d] font-semibold mb-2">✓ Green flags</p>
                        <ul className="space-y-1.5">
                          {aiRisk.greenFlags.map((f, i) => (
                            <li key={i} className="text-[12px] text-[#14532d] leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0">{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {aiRisk.redFlags.length > 0 && (
                      <div className="rounded-lg bg-[#fef2f2] border border-[#fecaca] p-3">
                        <p className="text-[11px] uppercase tracking-[0.05em] text-[#dc2626] font-semibold mb-2">⚠ Red flags</p>
                        <ul className="space-y-1.5">
                          {aiRisk.redFlags.map((f, i) => (
                            <li key={i} className="text-[12px] text-[#7f1d1d] leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0">{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Key factors */}
                {aiRisk.keyFactors.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-semibold mb-2">Key factors</p>
                    <div className="rounded-lg border border-[#e4e4e7] overflow-hidden">
                      <table className="w-full text-[12px]">
                        <thead className="bg-[#fafafa]">
                          <tr>
                            <th className="text-left py-2 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold">Factor</th>
                            <th className="text-left py-2 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold">Value</th>
                            <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-[#a1a1aa] font-semibold">Impact</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aiRisk.keyFactors.map((f, i) => (
                            <tr key={i} className="border-t border-[#f4f4f5]">
                              <td className="py-2 px-3 text-[#0a0a0a]">{f.factor}</td>
                              <td className="py-2 px-3 text-[#52525b]">{f.value}</td>
                              <td className={`py-2 px-3 text-right font-semibold ${
                                f.impact === "positive" ? "text-[#15803d]" :
                                f.impact === "negative" ? "text-[#dc2626]" :
                                "text-[#71717a]"
                              }`}>
                                {f.impact === "positive" ? "+" : f.impact === "negative" ? "−" : "•"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Reject Application (PENDING only) ──
              Approval now happens through "Set offer terms" below — the
              admin picks a range + 1-3 repayment plans and the applicant
              chooses on the offer page. Reject is the only one-click
              decision that still lives at the application level. */}
          {application.status === "PENDING" && (
            <div className="bg-white rounded-[10px] p-6">
              {!showRejectForm ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-[14px] font-bold tracking-[-0.02em] text-black">
                      Reject application
                    </h2>
                    <p className="text-[12px] text-[#71717a] mt-0.5">
                      Use this only when the applicant doesn't qualify. To approve, scroll down to "Set offer terms".
                    </p>
                  </div>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="inline-flex items-center gap-2 border border-[#dc2626] text-[#dc2626] bg-transparent rounded-lg px-4 py-2 font-semibold text-sm transition-colors hover:bg-[#fff1f2]"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                    Reject
                  </button>
                </div>
              ) : (
                <div>
                  <h2 className="text-[14px] font-bold tracking-[-0.02em] text-[#dc2626] mb-3">
                    Reject application
                  </h2>
                  <label htmlFor="reject-reason-select" className="block text-sm font-medium text-[#dc2626] mb-1.5">
                    Reason
                  </label>
                  <select
                    id="reject-reason-select"
                    value={rejectReasonKey}
                    onChange={(e) => {
                      const key = e.target.value;
                      setRejectReasonKey(key);
                      const preset = REJECT_REASONS.find((r) => r.value === key);
                      if (preset && preset.value !== "other") {
                        setRejectionReason(preset.reason);
                      } else if (preset?.value === "other") {
                        setRejectionReason(customRejectionReason);
                      } else {
                        setRejectionReason("");
                      }
                    }}
                    className="w-full rounded-lg border border-[#dc2626]/30 bg-white px-4 py-2.5 text-sm text-black focus:border-[#dc2626] focus:outline-none focus:ring-2 focus:ring-[#dc2626]/20 mb-3"
                  >
                    <option value="">Choose a reason…</option>
                    {REJECT_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>

                  {/* Free-text fallback only when "Other" is picked */}
                  {rejectReasonKey === "other" && (
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-[#dc2626] mb-1.5">
                        Custom rejection text (shown to applicant)
                      </label>
                      <textarea
                        placeholder="Write a clear, professional reason…"
                        value={customRejectionReason}
                        onChange={(e) => {
                          setCustomRejectionReason(e.target.value);
                          setRejectionReason(e.target.value);
                        }}
                        rows={3}
                        className="w-full rounded-lg border border-[#dc2626]/30 bg-white px-4 py-2.5 text-sm text-black placeholder:text-[#a1a1aa] focus:border-[#dc2626] focus:outline-none focus:ring-2 focus:ring-[#dc2626]/20"
                      />
                    </div>
                  )}

                  {/* Preview the message the applicant will see */}
                  {rejectionReason && (
                    <div className="mb-4 rounded-lg bg-[#fafafa] border border-[#e4e4e7] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#a1a1aa] font-bold mb-1.5">
                        Preview — applicant will see this
                      </p>
                      <p className="text-[12px] text-[#52525b] leading-relaxed">{rejectionReason}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleReject}
                      disabled={rejecting || !rejectionReason.trim()}
                      className="border border-[#dc2626] text-[#dc2626] bg-transparent rounded-lg px-6 py-2.5 font-semibold text-sm disabled:opacity-50 disabled:pointer-events-none transition-colors hover:bg-[#fff1f2]"
                    >
                      {rejecting ? "Rejecting..." : "Confirm Reject"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectReasonKey("");
                        setRejectionReason("");
                        setCustomRejectionReason("");
                      }}
                      className="text-sm text-[#71717a] hover:text-black"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Fund Advance (APPROVED) ── */}
          {application.status === "APPROVED" && (
            <div className="bg-white rounded-[10px] p-6">
              <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black mb-4 flex items-center gap-2">
                <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                </svg>
                Fund Advance
              </h2>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="fundAmount" className="block text-sm font-medium text-black mb-1.5">
                    Fund Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-sm font-medium">
                      $
                    </span>
                    <input
                      id="fundAmount"
                      type="number"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-4 py-2.5 text-sm text-black placeholder:text-[#a1a1aa] focus:border-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-black/10"
                    />
                  </div>
                </div>
                <button
                  onClick={handleFund}
                  disabled={funding}
                  className="inline-flex items-center gap-2 bg-[#1a1a1a] text-white rounded-lg px-6 py-2.5 font-semibold text-sm disabled:opacity-50 disabled:pointer-events-none transition-colors hover:bg-black"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  {funding ? "Funding…" : "Fund this"}
                </button>
              </div>
            </div>
          )}

          {/* ── Payment Schedule ── */}
          {["FUNDED", "ACTIVE", "REPAYING", "LATE", "COLLECTIONS", "DEFAULTED", "PAID_OFF"].includes(application.status) && (
            <PaymentScheduleCard applicationId={application.id} />
          )}

        </div>
      </div>
    </div>
  );
}

/* ── Bank Statements upload + verified monthly income ─────────────── */

type DocLite = {
  id: string;
  fileName: string;
  documentType: string;
  fileSize: number;
  storagePath: string;
};

function BankStatementsPanel({
  applicationId,
  documents,
  currentMonthlyIncome,
  onChange,
}: {
  applicationId: string;
  documents: DocLite[];
  currentMonthlyIncome: number | null;
  onChange: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<{
    monthlyIncome: number;
    avgWeeklyIncome: number;
    depositCount: number;
    largestDeposit: number;
    cadence: string;
    confidence: string;
    accountHolderName: string | null;
    bankName: string | null;
    notes: string | null;
    statementPeriodStart: string | null;
    statementPeriodEnd: string | null;
    bestChargeDay: { dayOfWeek: number; dayName: string; reason: string } | null;
  } | null>(null);
  const [monthly, setMonthly] = useState<string>(
    currentMonthlyIncome != null ? String(Math.round(currentMonthlyIncome)) : "",
  );

  const bankDocs = documents.filter((d) => d.documentType === "BANK_STATEMENT_90D");

  async function handleParse() {
    setParsing(true);
    setParseResult(null);
    try {
      const r = await parseBankStatementsWithAI(applicationId);
      if (r.ok) {
        setParseResult({
          monthlyIncome: r.monthlyIncome,
          avgWeeklyIncome: r.avgWeeklyIncome,
          depositCount: r.depositCount,
          largestDeposit: r.largestDeposit,
          cadence: r.cadence,
          confidence: r.confidence,
          accountHolderName: r.accountHolderName,
          bankName: r.bankName,
          notes: r.notes,
          statementPeriodStart: r.statementPeriodStart,
          statementPeriodEnd: r.statementPeriodEnd,
          bestChargeDay: r.bestChargeDay ?? null,
        });
        setMonthly(String(Math.round(r.monthlyIncome)));
        toast.success(
          `Parsed ${r.depositCount} deposits — verified income $${Math.round(r.monthlyIncome).toLocaleString()}/mo (${r.confidence} confidence)`,
        );
        onChange();
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) formData.append("files", files[i]);
      const r = await uploadBankStatements(applicationId, formData);
      if (r.ok) {
        toast.success(`Uploaded ${r.count} file${r.count > 1 ? "s" : ""}`);
        onChange();
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSaveIncome() {
    const value = parseFloat(monthly);
    if (isNaN(value) || value < 0) {
      toast.error("Enter a valid monthly amount");
      return;
    }
    setSavingIncome(true);
    try {
      const r = await setVerifiedMonthlyIncome(applicationId, value);
      if (r.ok) {
        toast.success("Verified income saved — recommendation will refresh");
        onChange();
      } else {
        toast.error(r.error);
      }
    } finally {
      setSavingIncome(false);
    }
  }

  return (
    <div className="bg-white rounded-[10px] p-6">
      <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black mb-1 flex items-center gap-2">
        <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.689c0-.864.933-1.405 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.405 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z" />
        </svg>
        Bank Statements (90 days)
      </h2>
      <p className="text-xs text-[#71717a] mb-4">
        Upload PDF statements or CSV exports the applicant emailed in.
        After reviewing, type the verified monthly income — the rules engine
        uses this to produce a recommendation.
      </p>

      {/* Uploaded files */}
      {bankDocs.length === 0 ? (
        <p className="text-sm text-[#a1a1aa] mb-4">No bank statements uploaded yet.</p>
      ) : (
        <ul className="mb-4 space-y-2">
          {bankDocs.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-lg bg-[#f8faf8] p-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f0f5f0] shrink-0">
                  <svg className="h-5 w-5 text-[#15803d]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black truncate">{d.fileName}</p>
                  <p className="text-xs text-[#a1a1aa]">{formatFileSize(d.fileSize)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/files/${encodeURIComponent(d.storagePath)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50"
                >
                  View
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete ${d.fileName}?`)) return;
                    const r = await deleteBankStatement(d.id);
                    if (r.ok) {
                      toast.success("Deleted");
                      onChange();
                    } else {
                      toast.error(r.error);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-white px-2.5 py-1.5 text-xs font-medium text-[#dc2626] hover:bg-red-50"
                  aria-label="Delete"
                  title="Delete"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Upload + Parse */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-block">
          <span className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-[#a1a1aa] bg-[#fafafa] px-4 py-2.5 text-sm font-medium text-black hover:bg-[#f4f4f5]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {uploading ? "Uploading…" : "Upload PDF or CSV"}
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.csv,image/png,image/jpeg"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
        {bankDocs.length > 0 && (
          <button
            type="button"
            onClick={handleParse}
            disabled={parsing}
            className="inline-flex items-center gap-2 rounded-lg bg-[#7c3aed] text-white px-4 py-2.5 text-sm font-semibold hover:bg-[#6d28d9] disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
            </svg>
            {parsing ? "Parsing with AI…" : "Parse with AI"}
          </button>
        )}
      </div>

      {/* Parse result */}
      {parseResult && (
        <div className="mt-4 rounded-lg border border-[#ddd6fe] bg-[#faf5ff] p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#7c3aed]">
              AI parse result
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
              parseResult.confidence === "high" ? "bg-[#dcfce7] text-[#15803d]" :
              parseResult.confidence === "medium" ? "bg-[#fef3c7] text-[#92400e]" :
              "bg-[#fef2f2] text-[#dc2626]"
            }`}>
              {parseResult.confidence} confidence
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <div>
              <div className="text-[#71717a] text-[10px] uppercase tracking-wide">Monthly income</div>
              <div className="font-bold text-black text-[15px]">${Math.round(parseResult.monthlyIncome).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[#71717a] text-[10px] uppercase tracking-wide">Weekly avg</div>
              <div className="font-bold text-black text-[15px]">${Math.round(parseResult.avgWeeklyIncome).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[#71717a] text-[10px] uppercase tracking-wide">Deposits</div>
              <div className="font-bold text-black text-[15px]">{parseResult.depositCount}</div>
            </div>
            <div>
              <div className="text-[#71717a] text-[10px] uppercase tracking-wide">Cadence</div>
              <div className="font-bold text-black text-[15px] capitalize">{parseResult.cadence}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-[#52525b]">
            {parseResult.accountHolderName && (
              <div>Account: <span className="text-black font-medium">{parseResult.accountHolderName}</span></div>
            )}
            {parseResult.bankName && (
              <div>Bank: <span className="text-black font-medium">{parseResult.bankName}</span></div>
            )}
            {parseResult.statementPeriodStart && parseResult.statementPeriodEnd && (
              <div className="col-span-2">
                Period: <span className="text-black font-medium">{parseResult.statementPeriodStart} → {parseResult.statementPeriodEnd}</span>
              </div>
            )}
          </div>
          {parseResult.bestChargeDay && (
            <div className="mt-3 rounded-md bg-white border border-[#bbf7d0] p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#15803d]">
                ✦ Best weekly debit day: {parseResult.bestChargeDay.dayName}
              </p>
              <p className="text-[11px] text-[#52525b] mt-1">{parseResult.bestChargeDay.reason}</p>
            </div>
          )}
          {parseResult.notes && (
            <p className="mt-3 text-[11px] text-[#71717a] italic border-t border-[#e9d5ff] pt-2">
              {parseResult.notes}
            </p>
          )}
          <p className="mt-3 text-[11px] text-[#7c3aed] font-medium">
            ✓ Values written into the application — recommendation refreshes below. Adjust manually if needed and click Save.
            {parseResult.bestChargeDay && " Weekly payment schedule will auto-snap to this day when the customer accepts the offer."}
          </p>
        </div>
      )}

      {/* Verified income */}
      <div className="mt-5 pt-5 border-t border-[#f4f4f5]">
        <label htmlFor="verified-monthly" className="block text-sm font-medium text-black mb-1.5">
          Verified monthly income
        </label>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a1a1aa] text-sm font-medium">$</span>
              <input
                id="verified-monthly"
                type="number"
                placeholder="0.00"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-4 py-2.5 text-sm text-black placeholder:text-[#a1a1aa] focus:border-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveIncome}
            disabled={savingIncome}
            className="bg-[#15803d] text-white rounded-lg px-6 py-2.5 font-semibold text-sm disabled:opacity-50 hover:bg-[#166534]"
          >
            {savingIncome ? "Saving…" : "Save & re-evaluate"}
          </button>
        </div>
        {currentMonthlyIncome != null && (
          <p className="mt-2.5 text-xs text-[#71717a]">
            Current verified monthly: <span className="font-semibold text-[#15803d]">${currentMonthlyIncome.toLocaleString()}</span>
            <span className="ml-3">3-month total: <span className="font-semibold text-black">${(currentMonthlyIncome * 3).toLocaleString()}</span></span>
          </p>
        )}
      </div>
    </div>
  );
}

function SignedAgreementPdfButton({ applicationId }: { applicationId: string }) {
  const [generating, setGenerating] = useState(false);
  async function handleClick() {
    if (generating) return;
    setGenerating(true);
    toast.message("Generating signed-agreement PDF…", {
      description: "Saves to CRM Files. Takes 10-30s.",
    });
    try {
      const r = await generateSignedAgreementPdf(applicationId);
      if (r.ok) {
        toast.success(`Saved ${r.fileName} (${Math.round((r.fileSize ?? 0) / 1024)} KB) to CRM Files.`);
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={generating}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#15803d]/30 bg-[#f0fdf4] text-[#15803d] px-3 py-1.5 text-xs font-semibold hover:bg-[#dcfce7] disabled:opacity-50 transition-colors"
    >
      <svg className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
      {generating ? "Generating…" : "Save PDF to CRM"}
    </button>
  );
}

/**
 * Admin button to cancel a signed cash-advance contract. Opens a
 * dialog asking for a reason (required for audit trail) and a choice
 * about whether to also clear the offer terms. Loud warning when the
 * application was already funded — the cash has already moved.
 */
function CancelSignedAgreementButton({
  applicationId,
  wasFunded,
  canceledAmount,
}: {
  applicationId: string;
  wasFunded: boolean;
  canceledAmount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [clearOffer, setClearOffer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) {
      toast.error("Cancellation reason is required for the audit log");
      return;
    }
    setSubmitting(true);
    try {
      const r = await cancelSignedAgreement({
        applicationId,
        reason: reason.trim(),
        clearOffer,
      });
      if (r.ok) {
        toast.success(
          `Canceled $${r.canceledAmount.toLocaleString()} contract. ${r.nextStep}`,
        );
        setOpen(false);
        setReason("");
        setClearOffer(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-[#dc2626]/30 bg-white text-[#dc2626] px-3 py-1.5 text-xs font-semibold hover:bg-[#fef2f2] transition-colors"
        title="Delete this signed contract + its payments. Use when admin or customer needs to cancel and redo."
      >
        Cancel contract
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
        <h2 className="text-[18px] font-bold text-[#dc2626] mb-2">
          Cancel signed contract?
        </h2>
        <p className="text-[13px] text-[#52525b] mb-4">
          This deletes the signed agreement, every payment row, and the signed-PDF document.
          The customer's offer is reset so they (or you) can redo it.
        </p>

        {wasFunded && (
          <div className="rounded-lg border-2 border-[#fbbf24] bg-[#fffbeb] p-3 mb-4">
            <p className="text-[12px] font-bold text-[#92400e] mb-1">
              ⚠ This customer was already funded ${canceledAmount.toLocaleString()}
            </p>
            <p className="text-[11px] text-[#92400e] leading-relaxed">
              The ACH credit has already been sent via Increase. Canceling here removes the database records but does NOT pull the money back. You'll need to handle the refund separately (have the customer return the funds via ACH or write off the loss).
            </p>
          </div>
        )}

        <label className="block mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#dc2626] block mb-1">
            Reason (required, saved to audit log)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Customer wanted $1,500 not $2,500; redoing offer"
            className="w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2626]/30"
          />
        </label>

        <label className="flex items-start gap-2 cursor-pointer mb-5 select-none">
          <input
            type="checkbox"
            checked={clearOffer}
            onChange={(e) => setClearOffer(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#dc2626] cursor-pointer flex-shrink-0"
          />
          <span className="text-[12px] text-[#52525b] leading-snug">
            Also clear the offer terms (resets to PENDING). Use when you want to set completely different terms next time. Leave unchecked to let the customer re-accept the same offer.
          </span>
        </label>

        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setReason("");
              setClearOffer(false);
            }}
            disabled={submitting}
            className="text-sm text-[#71717a] hover:text-black px-3 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !reason.trim()}
            className="bg-[#dc2626] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-[#b91c1c]"
          >
            {submitting ? "Canceling…" : "Confirm cancel contract"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * DocumentsPanel
 * Groups uploaded docs by type so the things admins actually need to
 * eyeball — the signed contract first, then bank statements, then
 * everything else — are obvious at a glance. Each row expands inline
 * to preview the PDF/image without leaving the page.
 * ───────────────────────────────────────────────────────────────── */

const DOC_GROUPS: Array<{
  key: string;
  label: string;
  types: string[];
  accent: { wrapper: string; iconBg: string; iconText: string };
}> = [
  {
    key: "contracts",
    label: "Signed contracts",
    types: ["SIGNED_AGREEMENT_PDF", "AGREEMENT"],
    accent: { wrapper: "border-[#15803d] bg-[#f0fdf4]", iconBg: "bg-[#15803d]", iconText: "text-white" },
  },
  {
    key: "bank",
    label: "Bank statements",
    types: ["BANK_STATEMENT_90D", "BANK_STATEMENT"],
    accent: { wrapper: "border-[#dbeafe] bg-[#f5f9ff]", iconBg: "bg-[#2563eb]", iconText: "text-white" },
  },
  {
    key: "identity",
    label: "Identity & income",
    types: ["IDENTIFICATION", "PAY_STUB", "DRIVER_LICENSE", "ID_FRONT", "ID_BACK"],
    accent: { wrapper: "border-[#e4e4e7] bg-white", iconBg: "bg-[#f4f4f5]", iconText: "text-[#15803d]" },
  },
];

function DocumentsPanel({
  applicationId,
  documents,
  onDelete,
  onRegenerateSignedAgreement,
}: {
  applicationId: string;
  documents: DocLite[];
  onDelete: (id: string, name: string) => Promise<void>;
  onRegenerateSignedAgreement?: () => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Track which docs have failed to load (HEAD/preview check) so we can
  // suggest Regenerate prominently when the file is missing on disk.
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());

  const markMissing = (id: string) =>
    setMissingIds((prev) => new Set(prev).add(id));

  const buckets = DOC_GROUPS.map((g) => ({
    ...g,
    docs: documents.filter((d) => g.types.includes(d.documentType)),
  }));
  const otherDocs = documents.filter(
    (d) => !DOC_GROUPS.some((g) => g.types.includes(d.documentType)),
  );

  void applicationId; // referenced by callers for regenerate

  return (
    <div className="bg-white rounded-[10px] p-6">
      <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black mb-4 flex items-center gap-2">
        <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        Documents ({documents.length})
      </h2>

      {documents.length === 0 ? (
        <p className="text-sm text-[#a1a1aa]">No documents uploaded.</p>
      ) : (
        <div className="space-y-5">
          {buckets.map((b) =>
            b.docs.length === 0 ? null : (
              <DocGroup
                key={b.key}
                label={b.label}
                accent={b.accent}
                docs={b.docs}
                openId={openId}
                setOpenId={setOpenId}
                onDelete={onDelete}
                missingIds={missingIds}
                onMissing={markMissing}
                onRegenerateSignedAgreement={b.key === "contracts" ? onRegenerateSignedAgreement : undefined}
              />
            ),
          )}
          {otherDocs.length > 0 && (
            <DocGroup
              label="Other"
              accent={{ wrapper: "border-[#e4e4e7] bg-white", iconBg: "bg-[#f4f4f5]", iconText: "text-[#52525b]" }}
              docs={otherDocs}
              openId={openId}
              setOpenId={setOpenId}
              onDelete={onDelete}
              missingIds={missingIds}
              onMissing={markMissing}
            />
          )}
        </div>
      )}
    </div>
  );
}

function DocGroup({
  label,
  accent,
  docs,
  openId,
  setOpenId,
  onDelete,
  missingIds,
  onMissing,
  onRegenerateSignedAgreement,
}: {
  label: string;
  accent: { wrapper: string; iconBg: string; iconText: string };
  docs: DocLite[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onDelete: (id: string, name: string) => Promise<void>;
  missingIds: Set<string>;
  onMissing: (id: string) => void;
  onRegenerateSignedAgreement?: () => Promise<void>;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#71717a] mb-2">
        {label} <span className="text-[#a1a1aa]">({docs.length})</span>
      </h3>
      <div className="space-y-2">
        {docs.map((doc) => {
          const isOpen = openId === doc.id;
          const url = `/api/files/${encodeURIComponent(doc.storagePath)}`;
          const ext = doc.fileName.split(".").pop()?.toLowerCase() || "";
          const isPdf = ext === "pdf";
          const isImage = ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
          const canPreview = isPdf || isImage;

          return (
            <div key={doc.id} className={`rounded-lg border ${accent.wrapper} overflow-hidden`}>
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${accent.iconBg}`}>
                    <svg className={`h-5 w-5 ${accent.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-black truncate">{doc.fileName}</p>
                    <p className="text-xs text-[#71717a]">
                      <span className="font-mono">{doc.documentType}</span> &middot; {formatFileSize(doc.fileSize)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {missingIds.has(doc.id) && onRegenerateSignedAgreement && doc.documentType === "SIGNED_AGREEMENT_PDF" && (
                    <button
                      type="button"
                      onClick={onRegenerateSignedAgreement}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#15803d] hover:bg-[#166534] px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                    >
                      Regenerate
                    </button>
                  )}
                  {canPreview && (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : doc.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#15803d] bg-white px-3 py-1.5 text-xs font-semibold text-[#15803d] hover:bg-[#f0fdf4] transition-colors"
                    >
                      {isOpen ? "Hide" : "Preview"}
                    </button>
                  )}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50 transition-colors"
                  >
                    Open
                  </a>
                  <a
                    href={url}
                    download={doc.fileName}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-50 transition-colors"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => onDelete(doc.id, doc.fileName)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-white px-2.5 py-1.5 text-xs font-medium text-[#dc2626] hover:bg-red-50"
                    aria-label="Delete"
                    title="Delete"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
              {isOpen && canPreview && (
                <div className="border-t border-[#e4e4e7] bg-white p-2">
                  {isPdf ? (
                    <iframe
                      src={url}
                      className="w-full h-[720px] rounded"
                      title={doc.fileName}
                      onLoad={(e) => {
                        // When the API returns 404 JSON, the iframe still
                        // loads but renders an error - probe with a HEAD
                        // request to detect "file missing on disk" and
                        // surface the Regenerate button.
                        const iframe = e.currentTarget;
                        fetch(url, { method: "HEAD" })
                          .then((res) => {
                            if (!res.ok) {
                              onMissing(doc.id);
                              iframe.style.display = "none";
                            }
                          })
                          .catch(() => {
                            onMissing(doc.id);
                            iframe.style.display = "none";
                          });
                      }}
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={url}
                      alt={doc.fileName}
                      className="max-w-full max-h-[720px] mx-auto"
                      onError={() => onMissing(doc.id)}
                    />
                  )}
                  {missingIds.has(doc.id) && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
                      <strong>File not on disk.</strong> The DB record exists but the underlying PDF/image is missing (likely orphaned from an earlier deploy).
                      {onRegenerateSignedAgreement && doc.documentType === "SIGNED_AGREEMENT_PDF" && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={onRegenerateSignedAgreement}
                            className="ml-1 underline font-semibold text-amber-900 hover:text-amber-700"
                          >
                            Regenerate the signed agreement
                          </button>
                          .
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Traffic Source ────────────────────────────────────────────────
// Sourced from the Contact row created by the apply funnel. Shows
// where the lead came from (UTM tags, ad click IDs, referrer, landing
// page) so we can tell paid vs organic at a glance.
type TrafficSourceContact = {
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  msclkid: string | null;
  landingPage: string | null;
  referrer: string | null;
  createdAt: Date | string | null;
} | null | undefined;

function summarizeChannel(c: NonNullable<TrafficSourceContact>): { label: string; tone: "google" | "meta" | "tiktok" | "bing" | "organic" | "direct" | "other" } {
  if (c.gclid || c.gbraid || c.wbraid) return { label: "Google Ads", tone: "google" };
  if (c.fbclid) return { label: "Meta Ads", tone: "meta" };
  if (c.ttclid) return { label: "TikTok Ads", tone: "tiktok" };
  if (c.msclkid) return { label: "Microsoft / Bing Ads", tone: "bing" };
  const src = (c.utmSource || "").toLowerCase();
  const med = (c.utmMedium || "").toLowerCase();
  if (med === "cpc" || med === "paid" || src.includes("google") || src.includes("facebook") || src.includes("tiktok")) {
    return { label: `Paid · ${c.utmSource || med}`, tone: "other" };
  }
  if (med === "organic" || src.includes("google_organic")) return { label: "Organic search", tone: "organic" };
  if (c.referrer) return { label: `Referral · ${shortHost(c.referrer)}`, tone: "other" };
  if (c.utmSource) return { label: c.utmSource, tone: "other" };
  return { label: "Direct / unknown", tone: "direct" };
}

function shortHost(url: string | null): string {
  if (!url) return "—";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

function shortPath(url: string | null): string {
  if (!url) return "—";
  try {
    const u = new URL(url);
    return (u.pathname + u.search).slice(0, 80) || "/";
  } catch {
    return url.slice(0, 80);
  }
}

function TrafficSourceCard({ contact }: { contact: TrafficSourceContact }) {
  if (!contact) {
    return (
      <div className="bg-white rounded-[10px] p-6">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black mb-2 flex items-center gap-2">
          <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0a8.949 8.949 0 0 0 4.951-1.488A3.987 3.987 0 0 0 13 16h-2a3.987 3.987 0 0 0-3.951 3.512A8.949 8.949 0 0 0 12 21Zm3-11.25a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          Traffic Source
        </h2>
        <p className="text-sm text-[#71717a]">No contact record linked to this application.</p>
      </div>
    );
  }

  const channel = summarizeChannel(contact);
  const toneClass: Record<typeof channel.tone, string> = {
    google: "bg-[#e8f0fe] text-[#1a73e8]",
    meta: "bg-[#e7f0ff] text-[#1877f2]",
    tiktok: "bg-[#fce8ee] text-[#fe2c55]",
    bing: "bg-[#e6f3f7] text-[#008373]",
    organic: "bg-[#e8f5e9] text-[#15803d]",
    direct: "bg-[#f4f4f5] text-[#52525b]",
    other: "bg-[#f4f4f5] text-[#27272a]",
  };

  const clickId =
    contact.gclid ? { label: "gclid", value: contact.gclid } :
    contact.gbraid ? { label: "gbraid", value: contact.gbraid } :
    contact.wbraid ? { label: "wbraid", value: contact.wbraid } :
    contact.fbclid ? { label: "fbclid", value: contact.fbclid } :
    contact.ttclid ? { label: "ttclid", value: contact.ttclid } :
    contact.msclkid ? { label: "msclkid", value: contact.msclkid } :
    null;

  return (
    <div className="bg-white rounded-[10px] p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
          <svg className="h-5 w-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0a8.949 8.949 0 0 0 4.951-1.488A3.987 3.987 0 0 0 13 16h-2a3.987 3.987 0 0 0-3.951 3.512A8.949 8.949 0 0 0 12 21Zm3-11.25a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          Traffic Source
        </h2>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${toneClass[channel.tone]}`}>
          {channel.label}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Source</p>
          <p className="mt-1 text-sm text-black">{contact.utmSource || contact.source || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Medium</p>
          <p className="mt-1 text-sm text-black">{contact.utmMedium || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Campaign</p>
          <p className="mt-1 text-sm text-black break-all">{contact.utmCampaign || "—"}</p>
        </div>
        {contact.utmTerm && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Term / Keyword</p>
            <p className="mt-1 text-sm text-black break-all">{contact.utmTerm}</p>
          </div>
        )}
        {contact.utmContent && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Ad Content</p>
            <p className="mt-1 text-sm text-black break-all">{contact.utmContent}</p>
          </div>
        )}
        {clickId && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Click ID ({clickId.label})</p>
            <p className="mt-1 text-xs font-mono text-black break-all">{clickId.value}</p>
          </div>
        )}
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Landing Page</p>
          <p className="mt-1 text-sm text-black break-all">
            {contact.landingPage ? (
              <>
                <span className="font-semibold">{shortHost(contact.landingPage)}</span>
                <span className="text-[#52525b]">{shortPath(contact.landingPage)}</span>
              </>
            ) : "—"}
          </p>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-semibold">Referrer</p>
          <p className="mt-1 text-sm text-black break-all">
            {contact.referrer ? (
              <>
                <span className="font-semibold">{shortHost(contact.referrer)}</span>
                <span className="text-[#52525b]">{shortPath(contact.referrer)}</span>
              </>
            ) : <span className="text-[#71717a]">Direct visit (no referrer)</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Prior advances panel ──────────────────────────────────────────
// Repeat-applicant context. When the same SSN (or email) has earlier
// advances in our system, surface them here so the reviewer can see
// outstanding exposure + repayment track record at a glance.

type PriorPayment = {
  paymentNumber: number;
  principal: any;
  amount: any;
  status: string;
  dueDate: Date | string | null;
  paidAt: Date | string | null;
};

type PriorAdvance = {
  id: string;
  applicationCode: string;
  status: string;
  loanAmount: any;
  fundedAmount: any | null;
  fundedAt: Date | string | null;
  createdAt: Date | string;
  rejectionReason: string | null;
  payments: PriorPayment[];
};

function statusTone(status: string): { bg: string; text: string } {
  switch (status) {
    case "FUNDED": return { bg: "bg-[#e8f5e9]", text: "text-[#15803d]" };
    case "PAID_OFF": return { bg: "bg-[#dcfce7]", text: "text-[#166534]" };
    case "LATE": return { bg: "bg-[#fef3c7]", text: "text-[#b45309]" };
    case "DEFAULTED": return { bg: "bg-[#fee2e2]", text: "text-[#dc2626]" };
    case "REJECTED": return { bg: "bg-[#fee2e2]", text: "text-[#dc2626]" };
    case "APPROVED": return { bg: "bg-[#dbeafe]", text: "text-[#1d4ed8]" };
    case "PENDING": return { bg: "bg-[#f4f4f5]", text: "text-[#52525b]" };
    default: return { bg: "bg-[#f4f4f5]", text: "text-[#52525b]" };
  }
}

function PriorAdvancesCard({ priorAdvances }: { priorAdvances: PriorAdvance[] }) {
  if (!priorAdvances || priorAdvances.length === 0) return null;

  // Summary roll-up
  let totalOutstanding = 0;
  let activeCount = 0;
  let paidOffCount = 0;
  let latePaymentTotal = 0;
  for (const adv of priorAdvances) {
    if (["FUNDED", "LATE"].includes(adv.status)) {
      activeCount++;
      const paidPrincipal = adv.payments
        .filter((p) => p.status === "PAID")
        .reduce((s, p) => s + Number(p.principal), 0);
      const totalPrincipal = adv.payments.reduce((s, p) => s + Number(p.principal), 0);
      totalOutstanding += Math.max(0, totalPrincipal - paidPrincipal);
    }
    if (adv.status === "PAID_OFF") paidOffCount++;
    latePaymentTotal += adv.payments.filter((p) => p.status === "LATE").length;
  }

  return (
    <div className="bg-white rounded-[10px] border-2 border-[#f97316] p-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="text-[16px] font-bold tracking-[-0.02em] text-black flex items-center gap-2">
          <svg className="h-5 w-5 text-[#f97316]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          Prior advances ({priorAdvances.length})
        </h2>
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {activeCount > 0 && (
            <span className="rounded-full bg-[#fff7ed] text-[#9a3412] font-semibold px-3 py-1">
              {activeCount} active · ${totalOutstanding.toFixed(2)} outstanding
            </span>
          )}
          {paidOffCount > 0 && (
            <span className="rounded-full bg-[#dcfce7] text-[#166534] font-semibold px-3 py-1">
              {paidOffCount} paid off
            </span>
          )}
          {latePaymentTotal > 0 && (
            <span className="rounded-full bg-[#fef3c7] text-[#b45309] font-semibold px-3 py-1">
              {latePaymentTotal} late payments
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {priorAdvances.map((adv) => {
          const tone = statusTone(adv.status);
          const total = adv.payments.length;
          const paid = adv.payments.filter((p) => p.status === "PAID").length;
          const late = adv.payments.filter((p) => p.status === "LATE").length;
          const paidPrincipal = adv.payments
            .filter((p) => p.status === "PAID")
            .reduce((s, p) => s + Number(p.principal), 0);
          const totalPrincipal = adv.payments.reduce((s, p) => s + Number(p.principal), 0);
          const outstanding = Math.max(0, totalPrincipal - paidPrincipal);
          const isActive = ["FUNDED", "LATE"].includes(adv.status);
          const fundedDate = adv.fundedAt ? new Date(adv.fundedAt) : null;
          const nextDue = adv.payments.find((p) => p.status === "PENDING" || p.status === "PROCESSING");

          return (
            <a
              key={adv.id}
              href={`/admin/applications/${adv.id}`}
              className="block rounded-lg border border-[#e4e4e7] hover:border-[#a1a1aa] p-4 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-[12px] font-semibold text-[#15803d] bg-[#f0f5f0] rounded px-2 py-0.5">
                    {adv.applicationCode}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone.bg} ${tone.text}`}>
                    {adv.status}
                  </span>
                  <span className="text-[13px] text-[#52525b]">
                    ${Number(adv.loanAmount).toFixed(0)} requested
                    {adv.fundedAmount && ` · $${Number(adv.fundedAmount).toFixed(0)} funded`}
                  </span>
                </div>
                <span className="text-[11px] text-[#71717a]">
                  {fundedDate ? `funded ${fundedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : `applied ${new Date(adv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </span>
              </div>

              {total > 0 && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#a1a1aa] font-semibold">Payments</p>
                    <p className="text-[13px] font-semibold text-black">{paid} / {total} paid</p>
                  </div>
                  {isActive && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[#a1a1aa] font-semibold">Outstanding</p>
                      <p className="text-[13px] font-semibold text-[#dc2626]">${outstanding.toFixed(2)}</p>
                    </div>
                  )}
                  {late > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[#a1a1aa] font-semibold">Late</p>
                      <p className="text-[13px] font-semibold text-[#b45309]">{late}</p>
                    </div>
                  )}
                  {isActive && nextDue?.dueDate && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[#a1a1aa] font-semibold">Next due</p>
                      <p className="text-[13px] font-semibold text-black">
                        {new Date(nextDue.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${Number(nextDue.amount).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {adv.status === "REJECTED" && adv.rejectionReason && (
                <p className="mt-2 text-[12px] text-[#dc2626]">Rejected: {adv.rejectionReason}</p>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
