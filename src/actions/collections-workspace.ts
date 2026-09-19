"use server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  collectionBalance,
  COLLECTION_ACCOUNT_STATUSES,
  OPEN_PAYMENT_STATUSES,
} from "@/lib/settlement-plan";
import { easternDateString } from "@/lib/eastern-time";
import { buildCollectionsTimeline } from "@/lib/collections-ladder";
import { collectionCommunications } from "@/lib/collection-history";
import { paymentProgress } from "@/lib/payment-progress";
import type { Prisma } from "@/generated/prisma/client";

async function staff() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Not authenticated");
  return session.user.email;
}
const paymentSelect = {
  id: true,
  paymentNumber: true,
  status: true,
  amount: true,
  principal: true,
  lateFee: true,
  collectedAmount: true,
  dueDate: true,
  increaseReturnReason: true,
  settlementId: true,
  supersededBySettlementId: true,
} satisfies Prisma.PaymentSelect;
export async function getCollectionsQueue() {
  await staff();
  const apps = await prisma.application.findMany({
    where: {
      status: { in: COLLECTION_ACCOUNT_STATUSES },
    },
    select: {
      id: true,
      applicationCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      collectionCase: true,
      payments: { select: paymentSelect },
      settlements: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
  });
  return apps
    .map((app) => {
      const balance = collectionBalance(
        app.payments.map((p) => ({
          ...p,
          amount: Number(p.amount),
          principal: Number(p.principal),
          lateFee: Number(p.lateFee),
          collectedAmount: Number(p.collectedAmount),
        })),
      );
      return {
        id: app.id,
        code: app.applicationCode,
        name: `${app.firstName} ${app.lastName}`,
        email: app.email,
        phone: app.phone,
        status: app.status,
        ...balance,
        ...paymentProgress(app.payments),
        ownerEmail: app.collectionCase?.ownerEmail ?? null,
        followUpAt: app.collectionCase?.followUpAt?.toISOString() ?? null,
        settlementStatus: app.settlements[0]?.status ?? null,
      };
    })
    .sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue ||
        b.overdue - a.overdue ||
        a.id.localeCompare(b.id),
    );
}

export async function getCollectionAccount(id: string) {
  await staff();
  const app = await prisma.application.findUnique({
    where: { id },
    select: {
      id: true,
      applicationCode: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      bankBalance: true,
      lastPlaidRefresh: true,
      collectionCase: true,
      contact: { select: { id: true } },
      payments: {
        select: { ...paymentSelect, increaseLastError: true, retryCount: true, attempts: { orderBy: { attemptNumber: "desc" }, select: { id: true, attemptNumber: true, initiatedAt: true, initiatedBy: true, amount: true, increaseTransferStatus: true, finalStatus: true, settledAt: true, returnReason: true } } },
        orderBy: [{ dueDate: "asc" }, { paymentNumber: "asc" }],
      },
      collectionEvents: { orderBy: { createdAt: "desc" } },
      settlements: { orderBy: { createdAt: "desc" }, omit: { baseContractPdf: true } },
    },
  });
  if (!app) throw new Error("Account not found");
  const contact = app.contact ?? await prisma.contact.findFirst({ where: { email: { equals: app.email, mode: "insensitive" } }, select: { id: true } });
  const communications = await collectionCommunications({ contactId: contact?.id ?? null, email: app.email, phone: app.phone });
  const payments = app.payments.map((p) => ({
    ...p,
    amount: Number(p.amount),
    principal: Number(p.principal),
    lateFee: Number(p.lateFee),
    collectedAmount: Number(p.collectedAmount),
  }));
  const balance = collectionBalance(payments);
  const timeline = buildCollectionsTimeline({
    status: app.status,
    payments: payments.filter((p) => !p.supersededBySettlementId),
    events: app.collectionEvents.filter((e) =>
      ["ESCALATED", "DEFAULTED", "DUNNING", "WARNING_SENT"].includes(
        e.eventType,
      ),
    ),
  });
  const pausedRule = await prisma.loanRule.findFirst({
    where: { key: "payments_paused_until" },
    select: { value: true },
  });
  const pausedUntil =
    pausedRule && new Date(pausedRule.value) > new Date()
      ? new Date(pausedRule.value).toISOString()
      : null;
  return {
    id: app.id,
    code: app.applicationCode,
    name: `${app.firstName} ${app.lastName}`,
    email: app.email,
    phone: app.phone,
    status: app.status,
    contactId: contact?.id ?? null,
    ...balance,
    ...paymentProgress(app.payments),
    pausedUntil,
    ownerEmail: app.collectionCase?.ownerEmail ?? null,
    followUpAt: app.collectionCase?.followUpAt?.toISOString() ?? null,
    bankBalance: app.bankBalance === null ? null : Number(app.bankBalance),
    bankBalanceUpdatedAt: app.lastPlaidRefresh?.toISOString() ?? null,
    communications: [...communications, ...app.collectionEvents.filter(e => ["EMAIL_SENT", "EMAIL_FAILED", "EMAIL_PREPARED"].includes(e.eventType)).map(e => {
      let message = {subject: "Account email", body: e.notes || ""};
      try { message = JSON.parse(e.notes || "{}"); } catch { /* retain older plain-text notes */ }
      return {id: `outbound:${e.id}`, channel: "Email", title: message.subject, body: message.body, date: e.createdAt.toISOString(), status: e.eventType === "EMAIL_SENT" ? "Sent" : e.eventType === "EMAIL_FAILED" ? "Failed" : "Delivery unconfirmed", by: e.performedBy};
    })].sort((a,b) => b.date.localeCompare(a.date)),
    payments: payments.map((p) => ({ ...p, dueDate: p.dueDate.toISOString(), attempts: p.attempts.map(a => ({ ...a, amount: Number(a.amount), initiatedAt: a.initiatedAt.toISOString(), settledAt: a.settledAt?.toISOString() ?? null })) })),
    events: app.collectionEvents.map((e) => ({
      id: e.id,
      type: e.eventType,
      notes: e.notes,
      by: e.performedBy,
      date: e.createdAt.toISOString(),
    })),
    upcoming: timeline.upcoming.map((s) => ({
      ...s,
      date: s.date?.toISOString() ?? null,
    })),
    settlements: app.settlements.map((s) => ({
      id: s.id,
      status: s.status,
      total: Number(s.total),
      originalBalance: Number(s.originalBalance),
      count: s.installmentCount,
      frequency: s.frequency,
      schedule: JSON.parse(s.scheduleJson) as {
        date: string;
        amount: number;
      }[],
      agreementText: s.agreementText,
      authorizationText: s.authorizationText,
      hash: s.agreementHash,
      hasBaseContract: !!s.baseContractHash,
      createdBy: s.createdBy,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      signedAt: s.signedAt?.toISOString() ?? null,
      signedName: s.signedName,
      sentAt: s.sentAt?.toISOString() ?? null,
    })),
  };
}

export async function updateCollectionCase(input: {
  applicationId: string;
  assignToMe?: boolean;
  followUpAt?: string | null;
  note?: string;
}) {
  const email = await staff();
  const note = input.note?.trim();
  if (note && note.length > 10000)
    throw new Error("Keep notes under 10,000 characters.");
  const followUp = input.followUpAt ? new Date(input.followUpAt) : null;
  if (followUp && !Number.isFinite(followUp.getTime()))
    throw new Error("Invalid follow-up date.");
  await prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({
      where: { id: input.applicationId },
      select: { id: true },
    });
    if (!app) throw new Error("Account not found.");
    const data = {
      ...(input.assignToMe !== undefined
        ? { ownerEmail: input.assignToMe ? email : null }
        : {}),
      ...(input.followUpAt !== undefined ? { followUpAt: followUp } : {}),
    };
    await tx.collectionCase.upsert({
      where: { applicationId: app.id },
      create: { applicationId: app.id, ...data },
      update: data,
    });
    const notes = [
      note,
      input.assignToMe === true
        ? "Assigned to me."
        : input.assignToMe === false
          ? "Unassigned."
          : null,
      input.followUpAt !== undefined
        ? followUp
          ? `Follow up: ${followUp.toISOString()}`
          : "Follow-up cleared."
        : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (notes)
      await tx.collectionEvent.create({
        data: {
          applicationId: app.id,
          eventType: "CASE_NOTE",
          performedBy: email,
          notes,
        },
      });
  });
  return { ok: true as const };
}

export async function createCollectionTicket(
  applicationId: string,
  reason: string,
) {
  const email = await staff();
  if (reason.trim().length < 3 || reason.length > 2000)
    throw new Error("Enter a ticket summary (3–2,000 characters).");
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { applicationCode: true, contact: { select: { id: true } } },
  });
  if (!app) throw new Error("Account not found.");
  await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({
      data: {
        contactId: app.contact?.id,
        reason: `${app.applicationCode}: ${reason.trim()}`,
        transcript: `Collections handoff for ${app.applicationCode}\n${reason.trim()}`,
        assignedTo: email,
      },
    });
    await tx.collectionEvent.create({
      data: {
        applicationId,
        eventType: "TICKET_CREATED",
        performedBy: email,
        notes: `Ticket ${t.id}: ${reason.trim()}`,
      },
    });
  });
  return { ok: true as const };
}

export async function chargeCollectionPayment(
  paymentId: string,
  amount: number,
) {
  const { requireNonSupportRole } = await import("@/lib/auth-helpers");
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { success: false, error: auth.error };
  const p = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (
    !p ||
    p.supersededBySettlementId ||
    !OPEN_PAYMENT_STATUSES.includes(p.status)
  )
    return {
      success: false,
      error: "This installment cannot be charged. Refresh the account.",
    };
  if (p.settlementId) {
    const s = await prisma.settlementAgreement.findUnique({
      where: { id: p.settlementId },
      select: { status: true },
    });
    if (
      s?.status !== "ACTIVE" ||
      easternDateString(p.dueDate) > easternDateString()
    )
      return {
        success: false,
        error:
          "Settlement payments can only be charged on or after their signed due date.",
      };
  }
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001
  )
    return {
      success: false,
      error: "Enter a positive amount with at most two decimal places.",
    };
  const { chargePartialPayment } = await import("@/actions/payments");
  return chargePartialPayment(paymentId, amount);
}
