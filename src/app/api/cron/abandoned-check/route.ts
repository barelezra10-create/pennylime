import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/sms/twilio";

// Runs every 5 minutes via Railway cron
// Tags contacts as "abandoned-app" if they:
// 1. Have stage "LEAD"
// 2. Have lastAppStep >= 1 and < 7 (started but didn't finish)
// 3. Haven't been updated in the last hour
// 4. Don't already have the "abandoned-app" tag
//
// On first detection: sends one recovery SMS, enrolls them in the
// abandoned-app email sequence. SMS only fires once because the tag
// check above filters out anyone we've already processed.

const SMS_REMINDER_BODY = (firstName: string) =>
  `Hi ${firstName}, your PennyLime cash advance is waiting. Finish your application in 2 mins: https://pennylime.com/apply  Reply STOP to opt out.`;

export async function GET(request: Request) {
  // Optional: verify cron auth
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  try {
    // Find contacts who started but didn't finish, inactive for 1h+
    const staleContacts = await prisma.contact.findMany({
      where: {
        stage: "LEAD",
        lastAppStep: { gte: 1, lt: 7 },
        updatedAt: { lt: oneHourAgo },
        tags: { none: { tag: "abandoned-app" } },
      },
      select: {
        id: true,
        firstName: true,
        email: true,
        phone: true,
        lastAppStep: true,
        smsOptIn: true,
        phoneVerifiedAt: true,
      },
    });

    let tagged = 0;
    let smsSent = 0;
    for (const contact of staleContacts) {
      // Add abandoned-app tag
      await prisma.contactTag.upsert({
        where: { contactId_tag: { contactId: contact.id, tag: "abandoned-app" } },
        update: {},
        create: { contactId: contact.id, tag: "abandoned-app" },
      });

      // Log activity
      await prisma.activity.create({
        data: {
          contactId: contact.id,
          type: "tag_added",
          title: `Auto-tagged as abandoned (stopped at step ${contact.lastAppStep}/6)`,
          performedBy: "system",
        },
      });

      tagged++;

      // Send one-time SMS reminder. Only fires for contacts who:
      //   - have a phone number that passed the verification step
      //   - haven't opted out of SMS
      // sendSms also re-checks smsOptIn server-side as a safety net.
      // Failures don't block tagging or email enrollment.
      if (contact.phone && contact.phoneVerifiedAt && contact.smsOptIn) {
        try {
          const r = await sendSms({
            to: contact.phone,
            body: SMS_REMINDER_BODY(contact.firstName),
            contactId: contact.id,
          });
          if (r.ok) {
            smsSent++;
            await prisma.activity.create({
              data: {
                contactId: contact.id,
                type: "sms_sent",
                title: "Abandoned-app SMS reminder sent",
                performedBy: "system",
              },
            });
          } else {
            console.warn(`[abandoned-check] SMS to ${contact.id} failed: ${r.error}`);
          }
        } catch (err) {
          console.warn(`[abandoned-check] SMS to ${contact.id} threw:`, err);
        }
      }

      // Auto-enroll in abandoned app recovery sequence
      const abandonedSequence = await prisma.emailSequence.findFirst({
        where: { triggerType: "abandoned_app", active: true },
      });
      if (abandonedSequence) {
        const steps = JSON.parse(abandonedSequence.steps);
        const firstDelay = steps[0];
        const delayMs = firstDelay
          ? (firstDelay.delayUnit === "days" ? firstDelay.delayAmount * 86400000 : firstDelay.delayAmount * 3600000)
          : 3600000;

        await prisma.sequenceEnrollment.upsert({
          where: { contactId_sequenceId: { contactId: contact.id, sequenceId: abandonedSequence.id } },
          update: {},
          create: {
            contactId: contact.id,
            sequenceId: abandonedSequence.id,
            status: "ACTIVE",
            currentStep: 0,
            nextSendAt: new Date(Date.now() + delayMs),
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      checked: staleContacts.length,
      tagged,
      smsSent,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Abandoned check error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
