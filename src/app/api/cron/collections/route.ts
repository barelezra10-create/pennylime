import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { getLoanRules } from "@/lib/rules-engine";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { collectionWarningEmail } from "@/lib/emails/collection-warning";
import { collectionEscalationEmail } from "@/lib/emails/collection-escalation";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const rules = await getLoanRules();
  const collectionsThreshold = parseInt(rules.collections_threshold_days || "30");

  const now = new Date();
  const day7 = new Date(now);
  day7.setDate(day7.getDate() - 7);
  const day14 = new Date(now);
  day14.setDate(day14.getDate() - 14);
  const day30 = new Date(now);
  day30.setDate(day30.getDate() - collectionsThreshold);

  let warnings7 = 0;
  let warnings14 = 0;
  let escalated = 0;

  // Find all active/late applications with failed payments
  const applications = await prisma.application.findMany({
    where: {
      status: { in: ["ACTIVE", "LATE", "COLLECTIONS"] },
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
    if (app.payments.length === 0) continue;

      // DEFAULTED escalation: COLLECTIONS for 90+ days
      if (app.status === "COLLECTIONS") {
        const ruleMap = rules; // rules is already loaded as Record<string, string>
        const defaultThreshold = parseInt(ruleMap.default_threshold_days ?? "90");
        const collectionsEvent = await prisma.collectionEvent.findFirst({
          where: {
            applicationId: app.id,
            eventType: "ESCALATED",
          },
          orderBy: { createdAt: "desc" },
        });

        if (collectionsEvent) {
          const daysSinceEscalation = Math.floor(
            (now.getTime() - collectionsEvent.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceEscalation >= defaultThreshold) {
            await prisma.application.update({
              where: { id: app.id },
              data: { status: "DEFAULTED" },
            });

            // Create RiskProfile
            const allPayments = await prisma.payment.findMany({
              where: { applicationId: app.id },
            });
            const totalPaid = allPayments
              .filter((p) => p.status === "PAID")
              .reduce((sum, p) => sum + Number(p.amount) + Number(p.lateFee), 0);
            const totalOwed = allPayments
              .reduce((sum, p) => sum + Number(p.amount), 0);
            const latePaymentCount = allPayments
              .filter((p) => Number(p.lateFee) > 0).length;

            if (app.ssnHash) {
              await prisma.riskProfile.create({
                data: {
                  applicationId: app.id,
                  ssnHash: app.ssnHash,
                  platform: app.platform ?? "unknown",
                  monthlyIncome: app.monthlyIncome ?? 0,
                  loanAmount: app.loanAmount,
                  loanTermMonths: app.loanTermMonths ?? 12,
                  interestRate: app.interestRate ?? 0,
                  outcome: "DEFAULTED",
                  totalPaid,
                  totalOwed,
                  latePaymentCount,
                  defaultedAt: new Date(),
                },
              });

              // Check retrain threshold
              const { checkAndTriggerRetrain } = await import("@/lib/risk-model");
              await checkAndTriggerRetrain();
            }

            await logAudit({
              action: "COLLECTIONS_ESCALATION",
              entityType: "APPLICATION",
              entityId: app.id,
              performedBy: "system:collections",
              details: { escalatedTo: "DEFAULTED", daysSinceCollections: daysSinceEscalation },
            });
          }
        }
        continue; // COLLECTIONS apps don't need warning checks
      }

    const oldestFailedDue = app.payments[0].dueDate;
    const daysOverdue = Math.floor(
      (now.getTime() - oldestFailedDue.getTime()) / (1000 * 60 * 60 * 24)
    );

    const totalOverdue = app.payments.reduce(
      (sum, p) => sum + Number(p.amount) + Number(p.lateFee),
      0
    );

    // 30+ days: escalate to COLLECTIONS
    if (daysOverdue >= collectionsThreshold && app.status !== "COLLECTIONS") {
      await prisma.application.update({
        where: { id: app.id },
        data: { status: "COLLECTIONS" },
      });

      await prisma.collectionEvent.create({
        data: {
          applicationId: app.id,
          eventType: "ESCALATED",
          notes: `Auto-escalated: ${daysOverdue} days overdue, $${totalOverdue.toFixed(2)} outstanding`,
        },
      });

      await logAudit({
        action: "COLLECTIONS_ESCALATION",
        entityType: "APPLICATION",
        entityId: app.id,
        performedBy: "system:collections",
        details: { daysOverdue, totalOverdue },
      });

      await sendEmail({
        to: app.email,
        ...collectionEscalationEmail({
          firstName: app.firstName,
          applicationCode: app.applicationCode,
          totalOverdue,
        }),
      });

      escalated++;
      continue;
    }

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
        });

        warnings7++;
      }
    }
  }

  return NextResponse.json({ warnings7, warnings14, escalated });
}
