import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Resend sends webhooks for: email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, data } = body;

    // Map Resend event types to our types
    const typeMap: Record<string, string> = {
      "email.delivered": "delivered",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.bounced": "bounced",
      "email.complained": "unsubscribed",
    };

    const eventType = typeMap[type];
    if (!eventType || !data?.email_id) {
      return NextResponse.json({ ok: true });
    }

    // Find the original sent event by messageId
    const sentEvent = await prisma.emailEvent.findFirst({
      where: { messageId: data.email_id, type: "sent" },
    });

    if (sentEvent) {
      // Log the new event
      await prisma.emailEvent.create({
        data: {
          contactId: sentEvent.contactId,
          campaignId: sentEvent.campaignId,
          sequenceId: sentEvent.sequenceId,
          type: eventType,
          messageId: data.email_id,
        },
      });

      // Update campaign stats
      if (sentEvent.campaignId) {
        if (eventType === "opened") {
          await prisma.emailCampaign.update({
            where: { id: sentEvent.campaignId },
            data: { totalOpened: { increment: 1 } },
          });
        }
        if (eventType === "clicked") {
          await prisma.emailCampaign.update({
            where: { id: sentEvent.campaignId },
            data: { totalClicked: { increment: 1 } },
          });
        }
      }

      // Auto-unsubscribe on complaint
      if (eventType === "unsubscribed") {
        await prisma.contactTag.upsert({
          where: { contactId_tag: { contactId: sentEvent.contactId, tag: "unsubscribed" } },
          update: {},
          create: { contactId: sentEvent.contactId, tag: "unsubscribed" },
        });
      }

      // Log activity
      await prisma.activity.create({
        data: {
          contactId: sentEvent.contactId,
          type: `email_${eventType}`,
          title: `Email ${eventType}: ${sentEvent.subject || ""}`,
          performedBy: "system",
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ ok: true }); // Always 200 so Resend doesn't retry
  }
}
