import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/emails/send";
import { collectionWarningEmail } from "@/lib/emails/collection-warning";
import { collectionEscalationEmail } from "@/lib/emails/collection-escalation";
import { collectionFinalNoticeEmail } from "@/lib/emails/collection-final-notice";
import { collectionDunningEmail } from "@/lib/emails/collection-dunning";
import { sendSms } from "@/lib/sms/twilio";
import {
  collectionWarningSms,
  collectionEscalationSms,
  collectionFinalNoticeSms,
  collectionDunningSms,
} from "@/lib/sms/transactional";
import { paymentsPausedUntil } from "@/lib/payment-pause";
import { FINAL_NOTICE_DAYS, DUNNING_INTERVAL_DAYS } from "@/lib/collections-ladder";

const DAY_MS = 1000 * 60 * 60 * 24;

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const pausedUntil = await paymentsPausedUntil();
  if (pausedUntil) {
    return NextResponse.json({ paused: true, resumesOn: pausedUntil.toISOString(), warnings7: 0, warnings14: 0, escalated: 0 });
  }

  const now = new Date();

  let warnings7 = 0;
  let warnings14 = 0;
  let escalated = 0;
  let finalNotices = 0;
  let dunningSent = 0;
  const defaulted = 0;

  // Find all in-repayment applications with failed payments. Includes
  // FUNDED + REPAYING so we don't lose loans that haven't transitioned
  // to ACTIVE yet (failed first-pay attempts on freshly-funded loans
  // would otherwise go unrescued).
  const applications = await prisma.application.findMany({
    where: {
      status: { in: ["FUNDED", "ACTIVE", "REPAYING", "LATE", "COLLECTIONS"] },
    },
    include: {
      payments: {
        where: { status: "FAILED" },
        orderBy: { dueDate: "asc" },
      },
      collectionEvents: true,
    },
  });

  for (const app of applications) {
    // Cached contact lookup for CRM logging on any email we send below.
    const linkedContact = await prisma.contact.findFirst({
      where: { applicationId: app.id },
      select: { id: true },
    });

    // COLLECTIONS accounts run the dunning flow regardless of whether they have
    // a FAILED payment row. Accounts pushed here by the NSF-roll service carry
    // their misses as REPLACED (not FAILED), so gating on FAILED skipped them.
    if (app.status === "COLLECTIONS") {

      // Real outstanding = EVERY unpaid payment (PENDING, FAILED, RETURNED,
      // PROCESSING), excluding only void rows (PAID/REPLACED/CANCELED/WAIVED).
      // Was PENDING+FAILED only, which undercounted RETURNED bounces (a
      // collections email showed ~$354 when the borrower actually owed $734).
      const unpaid = await prisma.payment.findMany({
        where: {
          applicationId: app.id,
          status: { notIn: ["PAID", "REPLACED", "CANCELED", "WAIVED"] },
          paidAt: null,
        },
        select: { amount: true, lateFee: true },
      });
      const collectionsOverdue = unpaid.reduce((s, p) => s + Number(p.amount) + Number(p.lateFee), 0);

      // Ensure an ESCALATED event exists so the clock + notices have a start.
      // Backfill (and send the first collections notice) for accounts that
      // reached COLLECTIONS via the roll service without one.
      let escalatedAt =
        app.collectionEvents
          .filter((e) => e.eventType === "ESCALATED")
          .map((e) => e.createdAt)
          .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
      let contactedThisRun = false;

      if (!escalatedAt) {
        const ev = await prisma.collectionEvent.create({
          data: {
            applicationId: app.id,
            eventType: "ESCALATED",
            performedBy: "system:collections",
            notes: `Backfilled escalation: already in collections, $${collectionsOverdue.toFixed(2)} outstanding`,
          },
        });
        escalatedAt = ev.createdAt;
        contactedThisRun = true;
        await sendEmail({
          to: app.email,
          ...collectionEscalationEmail({ firstName: app.firstName, applicationCode: app.applicationCode, totalOverdue: collectionsOverdue }),
          contactId: linkedContact?.id,
          templateId: "collection-escalation",
        });
        await sendSms({
          to: app.phone,
          body: collectionEscalationSms({ firstName: app.firstName, applicationCode: app.applicationCode, totalOverdue: collectionsOverdue }),
          contactId: linkedContact?.id,
          templateId: "collection-escalation",
        });
        escalated++;
      }

      const daysSinceEscalation = Math.floor((now.getTime() - escalatedAt.getTime()) / DAY_MS);

      // Pre-legal FINAL notice: once, between escalation and default.
      const finalSent = app.collectionEvents.some(
        (e) => e.eventType === "WARNING_SENT" && e.notes?.includes("final-notice"),
      );
      if (!contactedThisRun && !finalSent && daysSinceEscalation >= FINAL_NOTICE_DAYS) {
        await prisma.collectionEvent.create({
          data: { applicationId: app.id, eventType: "WARNING_SENT", performedBy: "system:collections", notes: `final-notice: ${daysSinceEscalation} days in collections, $${collectionsOverdue.toFixed(2)} outstanding` },
        });
        contactedThisRun = true;
        await sendEmail({ to: app.email, ...collectionFinalNoticeEmail({ firstName: app.firstName, applicationCode: app.applicationCode, totalOverdue: collectionsOverdue }), contactId: linkedContact?.id, templateId: "collection-final-notice" });
        await sendSms({ to: app.phone, body: collectionFinalNoticeSms({ firstName: app.firstName, applicationCode: app.applicationCode, totalOverdue: collectionsOverdue }), contactId: linkedContact?.id, templateId: "collection-final-notice" });
        finalNotices++;
      }

      // Recurring dunning between milestones: keep hitting them every
      // DUNNING_INTERVAL_DAYS until they pay or default. Skip if we already
      // contacted them this run so we never double-message in one pass.
      if (!contactedThisRun) {
        const lastComm = app.collectionEvents
          .filter((e) => ["WARNING_SENT", "DUNNING", "ESCALATED"].includes(e.eventType))
          .map((e) => e.createdAt)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        const dueForDunning = !lastComm || now.getTime() - lastComm.getTime() >= DUNNING_INTERVAL_DAYS * DAY_MS;
        if (dueForDunning) {
          await prisma.collectionEvent.create({
            data: { applicationId: app.id, eventType: "DUNNING", performedBy: "system:collections", notes: `dunning: ${daysSinceEscalation} days in collections, $${collectionsOverdue.toFixed(2)} outstanding` },
          });
          await sendEmail({ to: app.email, ...collectionDunningEmail({ firstName: app.firstName, applicationCode: app.applicationCode, totalOverdue: collectionsOverdue, daysInCollections: daysSinceEscalation }), contactId: linkedContact?.id, templateId: "collection-dunning" });
          await sendSms({ to: app.phone, body: collectionDunningSms({ firstName: app.firstName, applicationCode: app.applicationCode, totalOverdue: collectionsOverdue }), contactId: linkedContact?.id, templateId: "collection-dunning" });
          dunningSent++;
        }
      }

      // Moving to Default is an explicit staff action.

      continue;
    }

    // FUNDED/ACTIVE/REPAYING/LATE accounts escalate off real FAILED payments;
    // nothing to do without one.
    if (app.payments.length === 0) continue;

    const oldestFailedDue = app.payments[0].dueDate;
    const daysOverdue = Math.floor(
      (now.getTime() - oldestFailedDue.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Full balance owed (not just the FAILED rows loaded above): every unpaid
    // non-void payment, so warning emails show the true amount.
    const unpaidAll = await prisma.payment.findMany({
      where: {
        applicationId: app.id,
        status: { notIn: ["PAID", "REPLACED", "CANCELED", "WAIVED"] },
        paidAt: null,
      },
      select: { amount: true, lateFee: true },
    });
    const totalOverdue = unpaidAll.reduce(
      (sum, p) => sum + Number(p.amount) + Number(p.lateFee),
      0
    );

    // Overdue accounts stay Active/LATE until staff manually marks Default.

    // 14+ days: second warning + set LATE (if not already)
    if (daysOverdue >= 14) {
      // Set status to LATE if still ACTIVE
      if (app.status === "ACTIVE") {
        await prisma.application.update({
          where: { id: app.id },
          data: { status: "LATE" },
        });
      }

      // Send 14-day warning if not already sent (regardless of current status)
      const hasSecondWarning = app.collectionEvents.some(
        (e) => e.eventType === "WARNING_SENT" && e.notes?.includes("14-day")
      );
      if (!hasSecondWarning) {
        await prisma.collectionEvent.create({
          data: {
            applicationId: app.id,
            eventType: "WARNING_SENT",
            notes: `14-day warning: ${daysOverdue} days overdue`,
          },
        });

        await sendEmail({
          to: app.email,
          ...collectionWarningEmail({
            firstName: app.firstName,
            applicationCode: app.applicationCode,
            daysOverdue,
            totalOverdue,
            isSecondWarning: true,
          }),
          contactId: linkedContact?.id,
          templateId: "collection-warning",
        });

        await sendSms({
          to: app.phone,
          body: collectionWarningSms({
            firstName: app.firstName,
            applicationCode: app.applicationCode,
            daysOverdue,
            totalOverdue,
            isSecondWarning: true,
          }),
          contactId: linkedContact?.id,
          templateId: "collection-warning",
        });

        warnings14++;
      }
      continue;
    }

    // 7+ days: first warning
    if (daysOverdue >= 7) {
      const hasFirstWarning = app.collectionEvents.some(
        (e) => e.eventType === "WARNING_SENT" && e.notes?.includes("7-day")
      );
      if (!hasFirstWarning) {
        await prisma.collectionEvent.create({
          data: {
            applicationId: app.id,
            eventType: "WARNING_SENT",
            notes: `7-day warning: ${daysOverdue} days overdue`,
          },
        });

        await sendEmail({
          to: app.email,
          ...collectionWarningEmail({
            firstName: app.firstName,
            applicationCode: app.applicationCode,
            daysOverdue,
            totalOverdue,
            isSecondWarning: false,
          }),
          contactId: linkedContact?.id,
          templateId: "collection-warning",
        });

        await sendSms({
          to: app.phone,
          body: collectionWarningSms({
            firstName: app.firstName,
            applicationCode: app.applicationCode,
            daysOverdue,
            totalOverdue,
            isSecondWarning: false,
          }),
          contactId: linkedContact?.id,
          templateId: "collection-warning",
        });

        warnings7++;
      }
    }
  }

  return NextResponse.json({ warnings7, warnings14, escalated, finalNotices, dunningSent, defaulted });
}
