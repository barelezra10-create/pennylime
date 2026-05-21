"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

/**
 * Cancels a signed cash-advance contract. Deletes the ACH
 * authorization record + the scheduled payment rows, resets the
 * application back to OFFERED so the customer can re-accept (or
 * admin can re-offer with different terms).
 *
 * SAFETY NOTES:
 *  - This does NOT reverse any ACH credit that already went out via
 *    Increase. Money already in the customer's bank stays there.
 *    The admin needs to handle refunds separately if needed.
 *  - The funded flag is cleared so admin's view doesn't say "FUNDED"
 *    after cancel, but the increaseTransferId is preserved on the
 *    application for accounting + audit purposes.
 *  - Logs an audit row with the canceled amount + reason so we have
 *    a record of why this happened.
 */
export async function cancelSignedAgreement(input: {
  applicationId: string;
  reason: string;
  /** If true, also clears the offer entirely so admin can set fresh
   *  terms. If false (default), keeps the offer terms in place so
   *  the customer can re-accept the same offer. */
  clearOffer?: boolean;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { ok: false as const, error: "Not authenticated" };
  }
  if (!input.reason.trim()) {
    return { ok: false as const, error: "Cancellation reason is required" };
  }

  const app = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: {
      id: true,
      applicationCode: true,
      status: true,
      offerStatus: true,
      acceptedAmount: true,
      fundedAmount: true,
      fundedAt: true,
      increaseTransferId: true,
    },
  });
  if (!app) return { ok: false as const, error: "Application not found" };
  if (app.offerStatus !== "ACCEPTED") {
    return {
      ok: false as const,
      error: `Can't cancel — this application's offer status is ${app.offerStatus}, not ACCEPTED.`,
    };
  }

  // Snapshot for the audit log BEFORE we delete anything
  const wasFunded = !!app.increaseTransferId;
  const canceledAmount = Number(app.acceptedAmount ?? 0);

  // Delete AchAuthorization rows (every one — usually there's only 1)
  const deletedAuths = await prisma.achAuthorization.deleteMany({
    where: { applicationId: input.applicationId },
  });

  // Delete every Payment row for this application
  const deletedPayments = await prisma.payment.deleteMany({
    where: { applicationId: input.applicationId },
  });

  // Reset the application. Status back to APPROVED so it shows up
  // in the admin queue. Offer status back to OFFERED so the customer
  // can re-accept (or DECLINED if we're not letting them try again).
  // Keep increaseTransferId for accounting if money already went out.
  const updateData: Record<string, unknown> = {
    offerStatus: input.clearOffer ? "PENDING" : "OFFERED",
    acceptedAmount: null,
    acceptedTermIndex: null,
    acceptedAt: null,
    fundedAmount: null,
    fundedAt: null,
    status: wasFunded ? "APPROVED" : "APPROVED",
  };
  if (input.clearOffer) {
    updateData.offeredMinAmount = null;
    updateData.offeredMaxAmount = null;
    updateData.offeredTermsJson = null;
    updateData.offerToken = null;
    updateData.offerSentAt = null;
  }

  await prisma.application.update({
    where: { id: input.applicationId },
    data: updateData,
  });

  // Also delete the signed-agreement PDF document so it doesn't
  // show up in the CRM Files tab pointing at a canceled contract.
  // The file on disk stays (storage.delete could fail mid-way and
  // leave us in an inconsistent state); a future cleanup job can
  // sweep orphaned files.
  const signedPdfs = await prisma.document.findMany({
    where: {
      applicationId: input.applicationId,
      documentType: "SIGNED_AGREEMENT_PDF",
    },
  });
  if (signedPdfs.length > 0) {
    await prisma.document.deleteMany({
      where: { id: { in: signedPdfs.map((d) => d.id) } },
    });
  }

  await logAudit({
    action: "CONTRACT_CANCELED",
    entityType: "APPLICATION",
    entityId: input.applicationId,
    performedBy: session.user.email,
    details: {
      canceledAmount,
      wasFunded,
      increaseTransferId: app.increaseTransferId,
      reason: input.reason,
      deletedAuths: deletedAuths.count,
      deletedPayments: deletedPayments.count,
      deletedPdfs: signedPdfs.length,
      clearedOffer: !!input.clearOffer,
    },
  });

  revalidatePath(`/admin/applications/${input.applicationId}`);

  return {
    ok: true as const,
    canceledAmount,
    wasFunded,
    deletedPayments: deletedPayments.count,
    deletedAuths: deletedAuths.count,
    nextStep: input.clearOffer
      ? "Application is back to PENDING. Set new offer terms via 'Set offer terms'."
      : "Application is back to OFFERED. Customer can re-accept, or click 'Edit terms' to change.",
  };
}
