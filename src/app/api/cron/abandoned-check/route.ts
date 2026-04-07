import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Runs every 5 minutes via Railway cron
// Tags contacts as "abandoned-app" if they:
// 1. Have stage "LEAD"
// 2. Have lastAppStep >= 1 and < 7 (started but didn't finish)
// 3. Haven't been updated in the last hour
// 4. Don't already have the "abandoned-app" tag

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
      select: { id: true, firstName: true, email: true, lastAppStep: true },
    });

    let tagged = 0;
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
          title: `Auto-tagged as abandoned (stopped at step ${contact.lastAppStep}/7)`,
          performedBy: "system",
        },
      });

      tagged++;

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
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Abandoned check error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
