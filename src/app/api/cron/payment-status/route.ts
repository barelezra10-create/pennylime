import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { easternDayDiff } from "@/lib/eastern-time";
import { checkTransferStatus } from "@/lib/plaid-transfer";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { paymentSuccessEmail } from "@/lib/emails/payment-success";
import { paymentFailedEmail } from "@/lib/emails/payment-failed";
import { sendSms } from "@/lib/sms/twilio";
import { paymentFailedSms } from "@/lib/sms/transactional";
import { calculateRemainingBalance } from "@/lib/amortization";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  // Find all PROCESSING payments with a transfer ID
  const processingPayments = await prisma.payment.findMany({
    where: {
      status: "PROCESSING",
      achTransferId: { not: null },
    },
    include: {
      application: {
        include: { payments: true },
      },
    },
  });

  let settled = 0;
  let failed = 0;
  let pending = 0;

  for (const payment of processingPayments) {
    const status = await checkTransferStatus(payment.achTransferId!);

    if (status === "posted") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", paidAt: new Date() },
      });

      await logAudit({
        action: "PAYMENT_RECEIVED",
        entityType: "PAYMENT",
        entityId: payment.id,
        performedBy: "system:payment-status",
        details: { amount: Number(payment.amount) + Number(payment.lateFee) },
      });

      // Calculate remaining balance (excluding this payment which is now PAID)
      const allPayments = payment.application.payments.map((p) =>
        p.id === payment.id ? { ...p, status: "PAID" } : p
      );
      const remaining = calculateRemainingBalance(
        allPayments.map((p) => ({ principal: Number(p.principal), status: p.status }))
      );

      // Check if loan is fully paid off
      if (remaining <= 0) {
        await prisma.application.update({
          where: { id: payment.applicationId },
          data: { status: "PAID_OFF" },
        });

        // Create RiskProfile for training data
        const allPayments = await prisma.payment.findMany({
          where: { applicationId: payment.applicationId },
        });
        const totalPaid = allPayments
          .filter((p) => p.status === "PAID")
          .reduce((sum, p) => sum + Number(p.amount) + Number(p.lateFee), 0);
        const totalOwed = allPayments
          .reduce((sum, p) => sum + Number(p.amount), 0);
        const latePaymentCount = allPayments
          .filter((p) => Number(p.lateFee) > 0).length;

        const app = await prisma.application.findUnique({
          where: { id: payment.applicationId },
        });

        if (app?.ssnHash) {
          await prisma.riskProfile.create({
            data: {
              applicationId: payment.applicationId,
              ssnHash: app.ssnHash,
              platform: app.platform ?? "unknown",
              monthlyIncome: app.monthlyIncome ?? 0,
              loanAmount: app.loanAmount,
              loanTermMonths: app.loanTermMonths ?? 12,
              interestRate: app.interestRate ?? 0,
              outcome: "PAID_OFF",
              totalPaid,
              totalOwed,
              latePaymentCount,
              completedAt: new Date(),
            },
          });

          // Check retrain threshold
          const { checkAndTriggerRetrain } = await import("@/lib/risk-model");
          await checkAndTriggerRetrain();
        }
      } else {
        // If loan was LATE/FUNDED and all overdue payments caught up,
        // transition to ACTIVE. FUNDED loans can have a first-pay
        // failure that later recovers via cron retry — without this
        // they'd stay FUNDED forever instead of moving into ACTIVE.
        const overduePayments = allPayments.filter(
          (p) => p.status === "FAILED" || p.status === "LATE"
        );
        const currentStatus = payment.application.status;
        const canTransitionToActive =
          overduePayments.length === 0 && (currentStatus === "LATE" || currentStatus === "FUNDED");
        if (canTransitionToActive) {
          await prisma.application.update({
            where: { id: payment.applicationId },
            data: { status: "ACTIVE" },
          });
        }
      }

      // Send success email
      const successContact = await prisma.contact.findFirst({
        where: { applicationId: payment.applicationId },
        select: { id: true },
      });
      await sendEmail({
        to: payment.application.email,
        ...paymentSuccessEmail({
          firstName: payment.application.firstName,
          applicationCode: payment.application.applicationCode,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount) + Number(payment.lateFee),
          remainingBalance: remaining,
        }),
        contactId: successContact?.id,
        templateId: "payment-success",
      });

      settled++;
    } else if (status === "failed" || status === "cancelled") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      });

      const failContact = await prisma.contact.findFirst({
        where: { applicationId: payment.applicationId },
        select: { id: true },
      });
      // Send failure email
      await sendEmail({
        to: payment.application.email,
        ...paymentFailedEmail({
          firstName: payment.application.firstName,
          applicationCode: payment.application.applicationCode,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount),
        }),
        contactId: failContact?.id,
        templateId: "payment-failed",
      });
      await sendSms({
        to: payment.application.phone,
        body: paymentFailedSms({
          firstName: payment.application.firstName,
          amount: Number(payment.amount),
          paymentNumber: payment.paymentNumber,
        }),
        contactId: failContact?.id,
      });

      failed++;
    } else {
      pending++;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Refresh disbursement statuses too. Without this, an application's
  // Increase transfer stays frozen at "submitted" forever because the
  // webhook may not be wired up. Polls every still-in-flight credit
  // and updates Application.increaseTransferStatus.
  //
  // Pulls Applications where the stored Increase status hasn't already
  // posted ("settled"/"complete") or returned ("returned"/"rejected") -
  // those are terminal so no need to re-poll. Capped at 100 per run.
  // ──────────────────────────────────────────────────────────────
  let disbursementsRefreshed = 0;
  const TERMINAL = ["settled", "complete", "returned", "rejected", "canceled"];
  const pendingDisbursements = await prisma.application.findMany({
    where: {
      increaseTransferId: { not: null },
      OR: [
        { increaseTransferStatus: null },
        { increaseTransferStatus: { notIn: TERMINAL } },
      ],
    },
    select: {
      id: true,
      status: true,
      increaseTransferId: true,
      increaseTransferStatus: true,
      fundedAt: true,
    },
    take: 100,
  });
  for (const app of pendingDisbursements) {
    if (!app.increaseTransferId) continue;
    const isRtp = app.increaseTransferId.startsWith("real_time_payments_transfer_");
    const url = `https://api.increase.com${
      isRtp
        ? `/real_time_payments_transfers/${app.increaseTransferId}`
        : `/ach_transfers/${app.increaseTransferId}`
    }`;
    try {
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.INCREASE_API_KEY}`,
          "Increase-Version": "2024-04-15",
        },
      });
      if (!r.ok) continue;
      const data = (await r.json()) as { status?: string };
      const newStatus = data.status;
      if (!newStatus || newStatus === app.increaseTransferStatus) continue;
      const justSettled =
        (newStatus === "settled" || newStatus === "complete") &&
        app.status === "APPROVED";
      await prisma.application.update({
        where: { id: app.id },
        data: {
          increaseTransferStatus: newStatus,
          // Backstop FUNDED transition if webhook didn't run.
          status: justSettled ? "FUNDED" : app.status,
          fundedAt: justSettled && !app.fundedAt ? new Date() : app.fundedAt,
        },
      });
      disbursementsRefreshed++;
    } catch (err) {
      console.error(`[payment-status] disburse poll failed for ${app.id}:`, err);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Increase repayment poll. Mirrors the disbursement poll above but
  // for the Payment table. Catches any borrower debit whose terminal
  // event (settled / returned) didn't reach our webhook — without this,
  // a missed webhook leaves the Payment stuck in PROCESSING forever
  // and the parent Application never moves into REPAYING / LATE.
  // ──────────────────────────────────────────────────────────────
  let repaymentsRefreshed = 0;
  let repaymentsSettled = 0;
  let repaymentsReturned = 0;
  const dirtyApplicationIds = new Set<string>();
  // Sweep includes FAILED + RETURNED rows so we self-heal any
  // payment our DB has prematurely marked terminal while Increase
  // still considers it pending. Limited to 100 per run to stay
  // under Cloudflare's 100s window.
  const pendingRepayments = await prisma.payment.findMany({
    where: {
      increaseTransferId: { not: null },
      OR: [
        { status: { in: ["PROCESSING", "FAILED", "RETURNED"] } },
        { increaseTransferStatus: null },
        { increaseTransferStatus: { notIn: TERMINAL } },
      ],
    },
    select: {
      id: true,
      applicationId: true,
      status: true,
      paidAt: true,
      increaseTransferId: true,
      increaseTransferStatus: true,
    },
    take: 100,
  });
  for (const p of pendingRepayments) {
    if (!p.increaseTransferId) continue;
    const isRtp = p.increaseTransferId.startsWith("real_time_payments_transfer_");
    const url = `https://api.increase.com${
      isRtp
        ? `/real_time_payments_transfers/${p.increaseTransferId}`
        : `/ach_transfers/${p.increaseTransferId}`
    }`;
    try {
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.INCREASE_API_KEY}`,
          "Increase-Version": "2024-04-15",
        },
      });
      if (!r.ok) continue;
      const data = (await r.json()) as {
        status?: string;
        return?: { return_reason_code?: string };
        rejection?: { reject_reason_code?: string };
      };
      const newStatus = data.status;
      if (!newStatus || newStatus === p.increaseTransferStatus) continue;

      // Only "settled" / "complete" => PAID. Only the final "returned"
      // / "rejected" => RETURNED. Intermediate states like
      // "pending_returning", "submitted", "pending_submission" stay
      // PROCESSING — they're still in flight. Earlier mapping was
      // marking some of these as RETURNED prematurely.
      const isSettled = newStatus === "settled" || newStatus === "complete";
      const isReturn = newStatus === "returned" || newStatus === "rejected";
      const nextPaymentStatus = isReturn ? "RETURNED" : isSettled ? "PAID" : "PROCESSING";

      const { explainReturnCode } = await import("@/lib/ach-return-codes");
      const reasonCode =
        data.return?.return_reason_code ?? data.rejection?.reject_reason_code ?? null;
      const returnReason = isReturn ? explainReturnCode(reasonCode) : null;

      await prisma.payment.update({
        where: { id: p.id },
        data: {
          increaseTransferStatus: newStatus,
          paidAt: isSettled && !p.paidAt ? new Date() : p.paidAt,
          status: nextPaymentStatus,
          ...(returnReason ? { increaseReturnReason: returnReason } : {}),
        },
      });
      try {
        const { updateAttemptStatus } = await import("@/lib/payment-attempts");
        await updateAttemptStatus({
          transferId: p.increaseTransferId!,
          transferStatus: newStatus,
          finalStatus: isSettled ? "PAID" : isReturn ? "RETURNED" : null,
          settledAt: isSettled ? new Date() : null,
          returnReason: isReturn ? returnReason : null,
        });
      } catch (err) {
        console.error(`[payment-status] attempt update failed for ${p.id}:`, err);
      }
      repaymentsRefreshed++;
      if (isSettled) repaymentsSettled++;
      if (isReturn) repaymentsReturned++;
      if (isSettled || isReturn) {
        dirtyApplicationIds.add(p.applicationId);

        // Admin notification for the lifecycle change we just
        // observed. Same dispatcher as the webhook so emails read
        // identically regardless of which side caught the event.
        try {
          const owner = await prisma.application.findUnique({
            where: { id: p.applicationId },
            select: { applicationCode: true, firstName: true, lastName: true },
          });
          const fullPayment = await prisma.payment.findUnique({
            where: { id: p.id },
            select: { paymentNumber: true, amount: true, lateFee: true },
          });
          if (owner && fullPayment) {
            const { notifyPaymentSettled, notifyPaymentFailed } = await import("@/lib/notify-payment");
            const ctx = {
              applicationId: p.applicationId,
              applicationCode: owner.applicationCode,
              borrowerName: `${owner.firstName} ${owner.lastName}`.trim(),
              paymentNumber: fullPayment.paymentNumber,
              amount: Number(fullPayment.amount) + Number(fullPayment.lateFee),
              source: "cron" as const,
            };
            if (isSettled) await notifyPaymentSettled(ctx);
            else if (isReturn) await notifyPaymentFailed({ ...ctx, reason: newStatus });
          }
        } catch (notifyErr) {
          console.error(`[payment-status] notify failed for ${p.id}:`, notifyErr);
        }
      }
    } catch (err) {
      console.error(`[payment-status] repayment poll failed for ${p.id}:`, err);
    }
  }

  // --- GoACH status sync via the daily_update cursor feed ---
  {
    const { goachConfigured, dailyUpdate, mapGoachStatus, getTransaction } = await import("@/lib/goach");
    if (goachConfigured()) {
      const { getTrackingConfig, updateTrackingConfig } = await import("@/lib/tracking/config");
      const { explainReturnCode } = await import("@/lib/ach-return-codes");
      const { updateAttemptStatus } = await import("@/lib/payment-attempts");
      const cfg = await getTrackingConfig();
      let pointer = cfg.goachDailyUpdatePointer;
      let guard = 0;
      while (guard++ < 50) {
        const upd = await dailyUpdate(pointer);
        if (!upd.ok || upd.changes.length === 0) break;
        for (const ch of upd.changes) {
          try {
            const payment = await prisma.payment.findUnique({ where: { goachTransactionUuid: ch.transactionUuid }, select: { id: true, applicationId: true, paidAt: true } });
            if (payment) {
              let returnCode: string | null = null;
              if (mapGoachStatus(ch.to, null).isReturned) {
                const t = await getTransaction(ch.transactionUuid);
                if (t.ok) returnCode = t.returnCode;
              }
              const mapped = mapGoachStatus(ch.to, returnCode);
              await prisma.payment.update({
                where: { id: payment.id },
                data: {
                  increaseTransferStatus: ch.to,
                  status: mapped.paymentStatus,
                  paidAt: mapped.isSettled ? new Date() : payment.paidAt,
                  increaseReturnReason: returnCode ? explainReturnCode(returnCode) : undefined,
                },
              });
              await updateAttemptStatus({
                transferId: ch.transactionUuid,
                transferStatus: ch.to,
                finalStatus: mapped.isSettled ? "PAID" : mapped.isReturned ? "RETURNED" : mapped.paymentStatus === "FAILED" ? "FAILED" : undefined,
                settledAt: mapped.isSettled ? new Date() : undefined,
                returnReason: returnCode ? explainReturnCode(returnCode) : undefined,
              });
              dirtyApplicationIds.add(payment.applicationId);
            } else {
              const appRow = await prisma.application.findFirst({ where: { goachDisburseUuid: ch.transactionUuid }, select: { id: true } });
              if (appRow) {
                await prisma.application.update({ where: { id: appRow.id }, data: { increaseTransferStatus: ch.to } });
                dirtyApplicationIds.add(appRow.id);
              }
            }
          } catch (err) {
            console.error(`[payment-status] goach sync failed for ${ch.transactionUuid}:`, err);
          }
        }
        pointer = upd.newPointer;
        await updateTrackingConfig({ goachDailyUpdatePointer: pointer });
        if (upd.remaining === 0) break;
      }
    }
  }

  // Cascade payment-level changes onto each touched application so the
  // FUNDED -> REPAYING -> LATE -> PAID_OFF transitions land without a
  // separate cron pass.
  for (const appId of dirtyApplicationIds) {
    await refreshApplicationStatusFromPayments(appId);
  }

  return NextResponse.json({
    processed: processingPayments.length,
    settled,
    failed,
    pending,
    disbursementsRefreshed,
    repaymentsRefreshed,
    repaymentsSettled,
    repaymentsReturned,
  });
}

/**
 * Recompute an application's status from its payment ledger. Mirrors
 * the helper in the Increase webhook so both code paths (push events
 * + pull-based cron poll) drive the same lifecycle deterministically.
 *
 *   PAID_OFF  - every payment PAID
 *   LATE      - any RETURNED/FAILED, or any PENDING past dueDate (+grace)
 *   REPAYING  - at least one payment PAID and not paid off / not late
 *   FUNDED    - disbursed but no payments PAID yet
 *
 * Only acts on advances that have been disbursed (FUNDED/REPAYING/ACTIVE/LATE).
 * Will not override REJECTED/DEFAULTED/PAID_OFF/PENDING/APPROVED.
 */
async function refreshApplicationStatusFromPayments(applicationId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { payments: true },
  });
  if (!app) return;

  const ACTIVE_STATUSES = ["FUNDED", "REPAYING", "ACTIVE", "LATE"];
  if (!ACTIVE_STATUSES.includes(app.status)) return;

  const payments = app.payments;
  const allPaid = payments.length > 0 && payments.every((p) => p.status === "PAID");
  if (allPaid) {
    if (app.status !== "PAID_OFF") {
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "PAID_OFF" },
      });
    }
    return;
  }

  const now = new Date();
  const GRACE_DAYS = 1;
  const hasFailedPayment = payments.some(
    (p) => p.status === "RETURNED" || p.status === "FAILED",
  );
  // Eastern-anchored so UTC midnight doesn't prematurely flip
  // a borrower to LATE on the evening before grace expires.
  const hasOverduePending = payments.some(
    (p) =>
      (p.status === "PENDING" || p.status === "PROCESSING") &&
      p.dueDate &&
      easternDayDiff(now, p.dueDate) > GRACE_DAYS,
  );
  const isLate = hasFailedPayment || hasOverduePending;
  const hasPaidPayment = payments.some((p) => p.status === "PAID");

  let nextStatus: string = app.status;
  if (isLate) nextStatus = "LATE";
  else if (hasPaidPayment) nextStatus = "REPAYING";
  else nextStatus = "FUNDED";

  if (nextStatus !== app.status) {
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: nextStatus },
    });
    await syncContactStageForApplication(app, nextStatus);
  }
}

/**
 * Mirror an application status change onto the borrower's CRM Contact
 * pipeline stage. Lookup by ssnHash first (strongest match — survives
 * top-up applications that rewrite Contact.applicationId), then email.
 * See the matching helper in /api/increase/webhook for full mapping
 * docs.
 */
async function syncContactStageForApplication(
  app: { id: string; email: string; ssnHash: string | null },
  _newStatus: string,
): Promise<void> {
  const orClauses: Array<Record<string, unknown>> = [];
  if (app.ssnHash) orClauses.push({ application: { ssnHash: app.ssnHash } });
  if (app.email) orClauses.push({ email: { equals: app.email, mode: "insensitive" } });
  if (orClauses.length === 0) return;

  const contact = await prisma.contact.findFirst({
    where: { OR: orClauses },
    select: { id: true, stage: true, email: true },
  });
  if (!contact) return;

  const appOrClauses: Array<Record<string, unknown>> = [];
  if (app.ssnHash) appOrClauses.push({ ssnHash: app.ssnHash });
  if (contact.email) appOrClauses.push({ email: { equals: contact.email, mode: "insensitive" } });
  const allApps = await prisma.application.findMany({
    where: { OR: appOrClauses },
    select: { status: true },
  });

  const PRIORITY = [
    "FUNDED",
    "LATE",
    "REPAYING",
    "APPROVED",
    "OFFER_ACCEPTED",
    "PAID_OFF",
    "DEFAULTED",
    "PENDING",
    "REJECTED",
  ];
  const strongest = [...allApps].sort((a, b) => {
    const ai = PRIORITY.indexOf(a.status);
    const bi = PRIORITY.indexOf(b.status);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  })[0]?.status;
  if (!strongest) return;

  const STATUS_TO_STAGE: Record<string, string> = {
    APPROVED: "APPROVED",
    OFFER_ACCEPTED: "OFFER_ACCEPTED",
    FUNDED: "FUNDED",
    REPAYING: "REPAYING",
    LATE: "LATE",
    PAID_OFF: "PAID_OFF",
    DEFAULTED: "DEFAULTED",
    REJECTED: "REJECTED",
    PENDING: "APPLICANT",
  };
  const targetStage = STATUS_TO_STAGE[strongest];
  if (!targetStage || contact.stage === targetStage) return;

  try {
    const { updateContactStage } = await import("@/actions/contacts");
    await updateContactStage(contact.id, targetStage);
  } catch (err) {
    console.error(`[stage-sync] failed to update contact ${contact.id} to ${targetStage}:`, err);
  }
}
