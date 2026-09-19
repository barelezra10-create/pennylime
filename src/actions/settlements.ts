"use server";

import { createHash } from "node:crypto";
import { storage } from "@/lib/storage";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { getPortalApplicationId } from "@/lib/portal-auth";
import { sendEmail } from "@/lib/emails/send";
import {
  buildSettlementPlan,
  collectionBalance,
  settlementSnapshot,
  settlementAchText,
  settlementAmendmentText,
  paymentOutstanding,
  COLLECTION_ACCOUNT_STATUSES,
  type SettlementTerms,
} from "@/lib/settlement-plan";
import type { Payment } from "@/generated/prisma/client";

function normalized(payments: Payment[]) {
  return payments.map((p) => ({
    ...p,
    amount: Number(p.amount),
    principal: Number(p.principal),
    lateFee: Number(p.lateFee),
    collectedAmount: Number(p.collectedAmount),
  }));
}
function message(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    ["P2002", "P2034"].includes(String(error.code))
  )
    return "This account changed or already has a pending settlement. Refresh and try again.";
  return error instanceof Error
    ? error.message
    : "The settlement could not be saved.";
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function refresh() {
  revalidatePath("/support");
  revalidatePath("/portal");
}

export async function createSettlementDraft(
  input: SettlementTerms & {
    applicationId: string;
    expiresAt: string;
  },
) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  try {
    const schedule = buildSettlementPlan(input);
    const expiresAt = new Date(input.expiresAt);
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt <= new Date() ||
      expiresAt >= new Date(`${input.firstDate}T00:00:00Z`)
    )
      throw new Error(
        "The signing deadline must be in the future and before the first payment date.",
      );
    const original = await prisma.document.findFirst({ where: { applicationId: input.applicationId, documentType: "SIGNED_AGREEMENT_PDF" }, orderBy: { createdAt: "desc" } });
    if (!original) throw new Error("Generate the client’s signed advance contract before preparing a settlement. The settlement must use that same contract.");
    const baseContractPdf = await storage.read(original.storagePath);
    if (!baseContractPdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("The original advance contract is not a valid PDF. Regenerate it before continuing.");
    const baseContractHash = createHash("sha256").update(baseContractPdf).digest("hex");

    const id = await prisma.$transaction(
      async (tx) => {
        const app = await tx.application.findUnique({
          where: { id: input.applicationId },
          include: { payments: true },
        });
        if (!app || !COLLECTION_ACCOUNT_STATUSES.includes(app.status))
          throw new Error("This account is not eligible for a settlement.");
        const payments = normalized(app.payments);
        const balance = collectionBalance(payments);
        if (balance.processing)
          throw new Error(
            "Wait for all processing debits to settle or return before preparing a settlement.",
          );
        if (input.total > balance.outstanding || !balance.outstanding)
          throw new Error("The settlement must not exceed the unpaid balance.");
        const agreementText = settlementAmendmentText({total:input.total,frequency:input.frequency,applicationCode:app.applicationCode,schedule});
        const authorizationText = settlementAchText(input.total, input.count);
        const scheduleJson = JSON.stringify(schedule);
        const agreementHash = createHash("sha256")
          .update(
            JSON.stringify({
              agreementText,
              baseContractHash,
              authorizationText,
              scheduleJson,
              applicationId: app.id,
              expiresAt: expiresAt.toISOString(),
            }),
          )
          .digest("hex");
        // Expired offers cannot be accepted; keep them as history.
        await tx.settlementAgreement.updateMany({
          where: {
            applicationId: app.id,
            status: { in: ["DRAFT", "SENT"] },
            expiresAt: { lt: new Date() },
            sendStartedAt: null,
          },
          data: { status: "EXPIRED" },
        });
        const draft = await tx.settlementAgreement.create({
          data: {
            applicationId: app.id,
            total: input.total,
            installmentCount: input.count,
            frequency: input.frequency,
            firstPaymentDate: new Date(`${input.firstDate}T12:00:00Z`),
            scheduleJson,
            previousScheduleJson: settlementSnapshot(payments),
            originalBalance: balance.outstanding,
            agreementText,
            baseContractPdf: new Uint8Array(baseContractPdf),
            baseContractHash,
            baseContractName: original.fileName,
            authorizationText,
            agreementHash,
            createdBy: auth.email,
            expiresAt,
          },
        });
        await tx.collectionEvent.create({
          data: {
            applicationId: app.id,
            eventType: "SETTLEMENT_DRAFTED",
            performedBy: auth.email,
            notes: `Settlement ${draft.id}: $${input.total.toFixed(2)} in ${input.count} payments.`,
          },
        });
        return draft.id;
      },
      { isolationLevel: "Serializable" },
    );
    refresh();
    return { ok: true as const, id };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}

export async function sendSettlementAgreement(id: string) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  try {
    const dispatchAt = new Date();
    const expiredLease = new Date(dispatchAt.getTime() - 10 * 60_000);
    const draft = await prisma.$transaction(
      async (tx) => {
        const s = await tx.settlementAgreement.findUnique({
          where: { id },
          include: { application: { include: { payments: true } } },
        });
        if (
          !s ||
          !["DRAFT", "SENT"].includes(s.status) ||
          s.expiresAt <= new Date()
        )
          throw new Error("This settlement is unavailable or expired.");
        if (
          !COLLECTION_ACCOUNT_STATUSES.includes(s.application.status) ||
          settlementSnapshot(normalized(s.application.payments)) !==
            s.previousScheduleJson
        )
          throw new Error(
            "The payment schedule changed. Cancel this offer and prepare a new settlement.",
          );
        const claimed = await tx.settlementAgreement.updateMany({
          where: {
            id,
            status: s.status,
            OR: [
              { sendStartedAt: null },
              { sendStartedAt: { lt: expiredLease } },
            ],
          },
          data: { status: "SENT", sendStartedAt: dispatchAt },
        });
        if (!claimed.count)
          throw new Error("This agreement is already being sent.");
        return s;
      },
      { isolationLevel: "Serializable" },
    );
    const base = (process.env.NEXTAUTH_URL || "https://pennylime.com").replace(
      /\/$/,
      "",
    );
    const url = `${base}/portal/settlements/${id}`;
    const schedule = JSON.parse(draft.scheduleJson) as {
      date: string;
      amount: number;
    }[];
    const result = await sendEmail({
      to: draft.application.email,
      subject: `Review your PennyLime settlement · ${draft.application.applicationCode}`,
      html: `<p>Hello ${escape(draft.application.firstName)},</p><p>Your proposed settlement is ready to review: <strong>$${Number(draft.total).toFixed(2)}</strong> in ${draft.installmentCount} payments, starting ${schedule[0].date}.</p><p><a href="${escape(url)}">Sign in to review and sign your settlement</a></p><p>Signing deadline: ${draft.expiresAt.toISOString()}.</p><p>Your existing schedule stays in effect until you sign. The new agreement will replace its unpaid installments. No new advance is being issued.</p>`,
    });
    if (!result.success) {
      await prisma.settlementAgreement.updateMany({
        where: {
          id,
          status: "SENT",
          signedAt: null,
          sendStartedAt: dispatchAt,
        },
        data: { status: draft.status, sendStartedAt: null },
      });
      return {
        ok: false as const,
        error: "The email could not be sent. Try again.",
      };
    }
    await prisma.$transaction([
      prisma.settlementAgreement.updateMany({
        where: { id, sendStartedAt: dispatchAt },
        data: { sentAt: new Date(), sendStartedAt: null },
      }),
      prisma.collectionEvent.create({
        data: {
          applicationId: draft.applicationId,
          eventType: "SETTLEMENT_SENT",
          performedBy: auth.email,
          notes: `Agreement ${id} sent to ${draft.application.email}.`,
        },
      }),
    ]);
    refresh();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}

export async function cancelSettlementAgreement(id: string) {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false as const, error: auth.error };
  try {
    await prisma.$transaction(async (tx) => {
      const s = await tx.settlementAgreement.findUnique({ where: { id } });
      if (!s) throw new Error("Settlement not found.");
      const changed = await tx.settlementAgreement.updateMany({
        where: {
          id,
          status: { in: ["DRAFT", "SENT"] },
          OR: [
            { sendStartedAt: null },
            { sendStartedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
          ],
        },
        data: { status: "CANCELED", canceledAt: new Date() },
      });
      if (!changed.count)
        throw new Error(
          "Only an unsigned agreement that is not being sent can be canceled.",
        );
      await tx.collectionEvent.create({
        data: {
          applicationId: s.applicationId,
          eventType: "SETTLEMENT_CANCELED",
          performedBy: auth.email,
          notes: `Agreement ${id} canceled. Existing payments unchanged.`,
        },
      });
    });
    refresh();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}

export async function acceptSettlementAgreement(input: {
  id: string;
  signedName: string;
  agreedToAgreement: boolean;
  agreedToAch: boolean;
}) {
  const applicationId = await getPortalApplicationId();
  if (!applicationId)
    return {
      ok: false as const,
      error: "Sign in to your customer account first.",
    };
  if (
    input.agreedToAgreement !== true ||
    input.agreedToAch !== true ||
    input.signedName.trim().length < 4 ||
    input.signedName.length > 200 ||
    !/\s/.test(input.signedName.trim())
  )
    return {
      ok: false as const,
      error:
        "Review both agreements, check both boxes, and type your full legal name.",
    };
  try {
    const h = await headers();
    await prisma.$transaction(
      async (tx) => {
        const s = await tx.settlementAgreement.findUnique({
          where: { id: input.id },
          include: {
            application: {
              include: { payments: true, contact: { select: { id: true } } },
            },
          },
        });
        if (!s || s.applicationId !== applicationId)
          throw new Error("Settlement not found.");
        if (s.baseContractPdf && createHash("sha256").update(s.baseContractPdf).digest("hex") !== s.baseContractHash) throw new Error("The original contract snapshot could not be verified.");
        if (s.status === "ACTIVE") return; // idempotent repeat of the same acceptance
        if (s.status !== "SENT" || s.expiresAt <= new Date())
          throw new Error("This settlement is not available for signing.");
        if (!COLLECTION_ACCOUNT_STATUSES.includes(s.application.status))
          throw new Error(
            "The account changed. Contact support for an updated agreement.",
          );
        const payments = normalized(s.application.payments);
        if (collectionBalance(payments).processing)
          throw new Error(
            "A debit is processing. Contact support after it settles or returns.",
          );
        if (settlementSnapshot(payments) !== s.previousScheduleJson)
          throw new Error(
            "Your balance or schedule changed. Contact support for an updated agreement.",
          );
        const schedule = buildSettlementPlan({
          total: Number(s.total),
          count: s.installmentCount,
          frequency: s.frequency as SettlementTerms["frequency"],
          firstDate: s.firstPaymentDate.toISOString().slice(0, 10),
        });
        if (JSON.stringify(schedule) !== s.scheduleJson)
          throw new Error("The agreement schedule could not be verified.");
        const old = payments.filter((p) => paymentOutstanding(p) > 0);
        if (!old.length)
          throw new Error("There are no unpaid installments to replace.");
        // Row locks + serializable isolation conflict with payment claims. Never delete history.
        const replaced = await tx.payment.updateMany({
          where: {
            id: { in: old.map((p) => p.id) },
            status: {
              in: ["PENDING", "FAILED", "LATE", "RETURNED", "COLLECTIONS"],
            },
            supersededBySettlementId: null,
          },
          data: { status: "CANCELED", supersededBySettlementId: s.id },
        });
        if (replaced.count !== old.length)
          throw new Error("A payment changed. Refresh before signing.");
        const principalCents = Math.min(
          Math.round(Number(s.total) * 100),
          old.reduce(
            (sum, p) =>
              sum +
              Math.max(0, Math.round((p.principal - p.collectedAmount) * 100)),
            0,
          ),
        );
        const totalCents = Math.round(Number(s.total) * 100);
        let allocated = 0;
        let scheduledCents = 0;
        const maxNumber = Math.max(
          0,
          ...s.application.payments.map((p) => p.paymentNumber),
        );
        await tx.payment.createMany({
          data: schedule.map((row, i) => {
            scheduledCents += Math.round(row.amount * 100);
            const pc =
              (i === schedule.length - 1
                ? principalCents
                : Math.floor((scheduledCents * principalCents) / totalCents)) -
              allocated;
            allocated += pc;
            return {
              applicationId,
              settlementId: s.id,
              paymentNumber: maxNumber + i + 1,
              amount: row.amount,
              principal: pc / 100,
              interest: (Math.round(row.amount * 100) - pc) / 100,
              dueDate: new Date(`${row.date}T12:00:00Z`),
              status: "PENDING",
            };
          }),
        });
        const signedAt = new Date();
        const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
        const ua = h.get("user-agent")?.slice(0, 2000) || null;
        await tx.achAuthorization.create({
          data: {
            applicationId,
            contactId: s.application.contact?.id,
            signedName: input.signedName.trim(),
            ipAddress: ip,
            userAgent: ua,
            bankAccountMask:
              s.application.plaidAccountMask ??
              s.application.bankAccountNumberManual?.slice(-4),
            bankName:
              s.application.plaidInstitutionName ?? s.application.bankName,
            scheduleJson: s.scheduleJson,
            totalDebitAmount: s.total,
            authorizationText: s.authorizationText,
            agreementHash: s.agreementHash,
            agreementVersion: `settlement:${s.id}`,
          },
        });
        await tx.settlementAgreement.updateMany({
          where: { applicationId, status: "ACTIVE", id: { not: s.id } },
          data: { status: "SUPERSEDED" },
        });
        await tx.settlementAgreement.update({
          where: { id: s.id },
          data: {
            status: "ACTIVE",
            signedAt,
            signedName: input.signedName.trim(),
            signedIp: ip,
            signedUserAgent: ua,
          },
        });
        await tx.application.update({
          where: { id: applicationId },
          data: { status: "REPAYING", paymentFrequency: s.frequency },
        });
        await tx.collectionEvent.create({
          data: {
            applicationId,
            eventType: "SETTLEMENT_ACTIVATED",
            performedBy: `customer:${input.signedName.trim()}`,
            notes: `Agreement ${s.id} signed. Replaced ${old.length} unpaid installments with ${schedule.length} payments totaling $${Number(s.total).toFixed(2)}.`,
          },
        });
        await tx.auditLog.create({
          data: {
            action: "SETTLEMENT_ACTIVATED",
            entityType: "APPLICATION",
            entityId: applicationId,
            performedBy: `customer:${input.signedName.trim()}`,
            details: JSON.stringify({
              settlementId: s.id,
              agreementHash: s.agreementHash,
              replacedPaymentIds: old.map((p) => p.id),
              total: Number(s.total),
            }),
          },
        });
      },
      { isolationLevel: "Serializable", timeout: 15000 },
    );
    refresh();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: message(error) };
  }
}
