import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";

/**
 * Increase webhook receiver.
 * Verify HMAC signature, then update Application / Payment status based on
 * ACH transfer events (transfer.created, ach_transfer.updated, etc.).
 */

function verifySignature(rawBody: string, headerSig: string | null): boolean {
  const secret = process.env.INCREASE_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: missing secret in prod must NOT mean "accept everything".
    // Better to drop legit webhooks until the env var is set than to allow
    // anyone on the internet to forge transfer-status updates.
    if (process.env.NODE_ENV === "production") {
      console.error("[increase webhook] INCREASE_WEBHOOK_SECRET missing in production - rejecting");
      return false;
    }
    return true; // dev / local only
  }
  if (!headerSig) return false;

  // Increase signs with HMAC-SHA256, header format: t=<unix>,v1=<hexsig>
  const parts = Object.fromEntries(headerSig.split(",").map((p) => p.split("=") as [string, string]));
  const ts = parts.t;
  const sig = parts.v1;
  if (!ts || !sig) return false;

  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("Increase-Webhook-Signature");
  // Log every webhook arrival so we can diagnose silent failures.
  // Without this, signature mismatches return 401 with zero trace and
  // the admin sees stale statuses forever.
  console.log(`[increase webhook] arrived (sig=${sig ? "present" : "MISSING"} len=${raw.length})`);
  if (!verifySignature(raw, sig)) {
    console.error(`[increase webhook] signature verification FAILED - check INCREASE_WEBHOOK_SECRET matches the Increase dashboard endpoint secret`);
    return new Response("invalid signature", { status: 401 });
  }

  let body: { type?: string; associated_object_type?: string; associated_object_id?: string; created_at?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    console.error("[increase webhook] invalid JSON body");
    return new Response("invalid json", { status: 400 });
  }

  const objectType = body.associated_object_type;
  const objectId = body.associated_object_id;
  const eventType = body.type;
  console.log(`[increase webhook] event=${eventType} object=${objectType} id=${objectId}`);

  // Handle ACH + RTP transfer events with the same downstream logic.
  // RTP fires "real_time_payments_transfer.complete" when the destination
  // bank posts the credit (typically within seconds). RTP cannot return -
  // once complete it's final.
  const isAchEvent = objectType === "ach_transfer";
  const isRtpEvent = objectType === "real_time_payments_transfer";

  if ((isAchEvent || isRtpEvent) && objectId) {
    const prefix = isAchEvent ? "ach_transfer." : "real_time_payments_transfer.";
    const status = eventType?.replace(prefix, "") || "";
    // ACH statuses we care about:
    //   "submitted" -> NACHA file delivered to the Fed, not yet posted at
    //   the receiving bank. Treat as in-flight, NOT settled.
    //   "settled"   -> money has posted at the destination.
    //   "returned"  -> ACH return (NSF / R-code).
    // RTP statuses we care about:
    //   "complete"  -> credit posted at destination (instant + irrevocable)
    //   "rejected"  -> destination bank refused the RTP transfer
    const isReturn = status === "returned" || status === "rejected";
    const isSettled = status === "settled" || status === "complete";
    const isInflight = status === "submitted" || status === "pending_submission";

    // Disbursement leg: webhook fires when our credit to the borrower
    // posts. Flip APPROVED -> FUNDED so the UI + financial summaries
    // reflect reality even if the original fundApplication() retry path
    // never got back to us.
    const app = await prisma.application.findFirst({ where: { increaseTransferId: objectId } });
    if (app) {
      const nextAppStatus =
        app.status === "APPROVED" && (isSettled || isInflight) ? "FUNDED" : app.status;
      await prisma.application.update({
        where: { id: app.id },
        data: {
          increaseTransferStatus: status || null,
          status: nextAppStatus,
          fundedAt: app.fundedAt ?? ((isSettled || isInflight) ? new Date() : null),
        },
      });
    }
    // Repayment leg: webhook fires when a borrower's weekly debit either
    // posts (settle -> PAID) or returns (NSF -> RETURNED).
    const payment = await prisma.payment.findFirst({ where: { increaseTransferId: objectId } });
    if (payment) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          increaseTransferStatus: status,
          paidAt: isSettled ? new Date() : payment.paidAt,
          status: isReturn ? "RETURNED" : isSettled ? "PAID" : payment.status,
        },
      });

      // Cascade the payment event to the parent application status so
      // the pipeline / financial summaries reflect reality without a
      // manual nudge.
      if (isSettled || isReturn) {
        await refreshApplicationStatusFromPayments(payment.applicationId);

        // Fire admin notification. Best-effort — failures are swallowed
        // by notifyAdmins so they never block the webhook ack.
        try {
          const owner = await prisma.application.findUnique({
            where: { id: payment.applicationId },
            select: { applicationCode: true, firstName: true, lastName: true },
          });
          if (owner) {
            const { notifyPaymentSettled, notifyPaymentFailed } = await import("@/lib/notify-payment");
            const ctx = {
              applicationId: payment.applicationId,
              applicationCode: owner.applicationCode,
              borrowerName: `${owner.firstName} ${owner.lastName}`.trim(),
              paymentNumber: payment.paymentNumber,
              amount: Number(payment.amount) + Number(payment.lateFee),
              source: "webhook" as const,
            };
            if (isSettled) await notifyPaymentSettled(ctx);
            else if (isReturn) await notifyPaymentFailed({ ...ctx, reason: status });
          }
        } catch (notifyErr) {
          console.error("[increase webhook] notify failed:", notifyErr);
        }
      }
    }
  }

  return Response.json({ ok: true });
}

/**
 * Recompute an application's status from its payment ledger. Drives the
 * FUNDED -> REPAYING -> LATE -> PAID_OFF lifecycle automatically so we
 * don't need a human to flip statuses when an ACH posts or returns.
 *
 *   PAID_OFF  - every payment PAID
 *   LATE      - any RETURNED/FAILED past grace, or PENDING past dueDate
 *   REPAYING  - at least one payment PAID and not paid off / not late
 *   FUNDED    - disbursed but no payments PAID yet
 *
 * The function only DOWNGRADES into REPAYING/LATE from FUNDED — it never
 * overrides terminal statuses (REJECTED/DEFAULTED) or pre-disburse
 * statuses (PENDING/APPROVED).
 */
async function refreshApplicationStatusFromPayments(applicationId: string): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { payments: true },
  });
  if (!app) return;

  // Only act on advances that have actually been disbursed.
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
  const hasOverduePending = payments.some(
    (p) =>
      (p.status === "PENDING" || p.status === "PROCESSING") &&
      p.dueDate &&
      (now.getTime() - p.dueDate.getTime()) / (1000 * 60 * 60 * 24) > GRACE_DAYS,
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
 * pipeline stage so the kanban + contact page reflect lifecycle without
 * a human touching the dropdown. Stage IS a 1:1 relation that points
 * at the borrower's most recent application, so we look up the contact
 * by ssnHash (strongest match for repeat borrowers) before falling
 * back to email.
 *
 * Mapping:
 *   APPROVED  -> APPROVED   (handled elsewhere, included for completeness)
 *   FUNDED    -> FUNDED
 *   REPAYING  -> REPAYING
 *   LATE      -> REPAYING   (no LATE pipeline stage; flagged via badge)
 *   PAID_OFF  -> PAID_OFF
 *   DEFAULTED -> DEFAULTED
 *
 * Skips when no contact is found (lead never made it into the CRM)
 * or when the current stage is already correct.
 */
async function syncContactStageForApplication(
  app: { id: string; email: string; ssnHash: string | null },
  _newStatus: string,
): Promise<void> {
  // Look up the borrower's contact (by ssnHash first, email fallback)
  // and ALL their applications, then drive the pipeline stage from the
  // strongest one. We can't just act on the app that changed because a
  // repeat borrower's rejected top-up would otherwise downgrade their
  // contact stage even though their original advance is still funded.
  const orClauses: Array<Record<string, unknown>> = [];
  if (app.ssnHash) {
    orClauses.push({ application: { ssnHash: app.ssnHash } });
  }
  if (app.email) {
    orClauses.push({ email: { equals: app.email, mode: "insensitive" } });
  }
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
    LATE: "REPAYING",
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
