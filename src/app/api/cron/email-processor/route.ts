import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMarketingEmail } from "@/lib/email-sender";
import { resolveSegment } from "@/lib/segment-resolver";
import type { SequenceStep } from "@/types/email";
import type { SegmentRule } from "@/types/email";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let sequenceSent = 0;
  let campaignSent = 0;

  try {
    // ─── Process sequence enrollments ───────────────────────
    const dueEnrollments = await prisma.sequenceEnrollment.findMany({
      where: { status: "ACTIVE", nextSendAt: { lte: now } },
      include: { contact: { select: { id: true, email: true, firstName: true, tags: true } } },
    });

    for (const enrollment of dueEnrollments) {
      // Skip unsubscribed
      if (enrollment.contact.tags.some((t) => t.tag === "unsubscribed")) {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "CANCELLED" },
        });
        continue;
      }

      const sequence = await prisma.emailSequence.findUnique({ where: { id: enrollment.sequenceId } });
      if (!sequence || !sequence.active) {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "CANCELLED" },
        });
        continue;
      }

      const steps: SequenceStep[] = JSON.parse(sequence.steps);
      const currentStep = steps.find((s) => s.order === enrollment.currentStep);

      if (!currentStep) {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "COMPLETED" },
        });
        continue;
      }

      // Personalize
      const personalizedBody = currentStep.body
        .replace(/\{firstName\}/g, enrollment.contact.firstName)
        .replace(/\{email\}/g, enrollment.contact.email);
      const personalizedSubject = currentStep.subject
        .replace(/\{firstName\}/g, enrollment.contact.firstName);

      await sendMarketingEmail({
        to: enrollment.contact.email,
        subject: personalizedSubject,
        html: personalizedBody,
        contactId: enrollment.contact.id,
        sequenceId: enrollment.sequenceId,
      });

      // Advance to next step
      const nextStep = steps.find((s) => s.order === enrollment.currentStep + 1);
      if (nextStep) {
        const delayMs = nextStep.delayUnit === "days"
          ? nextStep.delayAmount * 24 * 60 * 60 * 1000
          : nextStep.delayAmount * 60 * 60 * 1000;
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: {
            currentStep: enrollment.currentStep + 1,
            nextSendAt: new Date(now.getTime() + delayMs),
          },
        });
      } else {
        await prisma.sequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { status: "COMPLETED" },
        });
      }

      sequenceSent++;
    }

    // ─── Process scheduled campaigns ────────────────────────
    const dueCampaigns = await prisma.emailCampaign.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    });

    for (const campaign of dueCampaigns) {
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: "SENDING" },
      });

      const rules: SegmentRule[] = JSON.parse(campaign.segmentRules);
      const audience = await resolveSegment(rules);

      let sent = 0;
      for (const contact of audience) {
        const personalizedBody = campaign.body
          .replace(/\{firstName\}/g, contact.firstName)
          .replace(/\{email\}/g, contact.email);
        const personalizedSubject = campaign.subject
          .replace(/\{firstName\}/g, contact.firstName);

        await sendMarketingEmail({
          to: contact.email,
          subject: personalizedSubject,
          html: personalizedBody,
          contactId: contact.id,
          campaignId: campaign.id,
        });
        sent++;
      }

      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: "SENT", sentAt: now, totalSent: sent, audienceCount: audience.length },
      });
      campaignSent += sent;
    }

    return NextResponse.json({ ok: true, sequenceSent, campaignSent, timestamp: now.toISOString() });
  } catch (error) {
    console.error("Email processor error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
