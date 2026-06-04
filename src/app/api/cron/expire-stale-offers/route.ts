import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { offerExpiredEmail } from "@/lib/emails/offer-expired";

const EXPIRY_DAYS = 3;

/**
 * Auto-cancel offers that the borrower never signed.
 *
 * Trigger window: offerStatus = OFFERED and offerSentAt is more than
 * 3 days ago. Flips offerStatus -> EXPIRED, application status ->
 * REJECTED with reason "Offer expired (not signed within 3 days)",
 * and emails the borrower a soft "you can reapply any time" notice.
 *
 * Contact pipeline stage updates automatically via the existing
 * sync helper in payment-status / increase webhook routes (REJECTED
 * status -> REJECTED stage).
 *
 * Safe to run as often as you want — idempotent on already-expired
 * rows because the WHERE clause excludes anything that isn't still
 * OFFERED.
 */
export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - EXPIRY_DAYS);

  const stale = await prisma.application.findMany({
    where: {
      offerStatus: "OFFERED",
      offerSentAt: { lt: cutoff },
      status: { notIn: ["FUNDED", "REPAYING", "PAID_OFF", "DEFAULTED", "LATE", "REJECTED"] },
    },
    select: {
      id: true,
      applicationCode: true,
      firstName: true,
      email: true,
      offerSentAt: true,
      offeredMaxAmount: true,
    },
  });

  let expired = 0;
  let emailed = 0;
  let emailFailed = 0;

  for (const app of stale) {
    await prisma.application.update({
      where: { id: app.id },
      data: {
        offerStatus: "EXPIRED",
        status: "REJECTED",
        rejectionReason: "Offer expired (not signed within 3 days)",
      },
    });
    expired++;

    await logAudit({
      action: "REJECT",
      entityType: "APPLICATION",
      entityId: app.id,
      performedBy: "system:expire-stale-offers",
      details: {
        kind: "offer_expired",
        offerSentAt: app.offerSentAt?.toISOString() ?? null,
        offeredMaxAmount: app.offeredMaxAmount ? Number(app.offeredMaxAmount) : null,
      },
    });

    // Contact + stage sync. updateContactStage runs side effects
    // (server-side conversion ping, sequence enrollment) so we do it
    // via the existing helper instead of a raw prisma write.
    try {
      const contact = await prisma.contact.findFirst({
        where: { email: { equals: app.email, mode: "insensitive" } },
        select: { id: true, stage: true },
      });
      if (contact && contact.stage !== "REJECTED") {
        const { updateContactStage } = await import("@/actions/contacts");
        await updateContactStage(contact.id, "REJECTED");
      }
    } catch (err) {
      console.error(`[expire-stale-offers] contact stage sync failed for ${app.id}:`, err);
    }

    // Soft "you can reapply" email. Failures are logged but never
    // block the expiry — the offer itself is the source of truth.
    try {
      const r = await sendEmail({
        to: app.email,
        ...offerExpiredEmail({
          firstName: app.firstName,
          applicationCode: app.applicationCode,
          offerAmount: app.offeredMaxAmount ? Number(app.offeredMaxAmount) : 0,
        }),
        templateId: "offer-expired",
      });
      if (r.success) emailed++;
      else emailFailed++;
    } catch (err) {
      emailFailed++;
      console.error(`[expire-stale-offers] email send failed for ${app.id}:`, err);
    }
  }

  console.log(`[expire-stale-offers] expired=${expired} emailed=${emailed} emailFailed=${emailFailed}`);
  return NextResponse.json({ expired, emailed, emailFailed, expiryDays: EXPIRY_DAYS });
}
