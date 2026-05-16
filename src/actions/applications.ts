"use server";

import { prisma } from "@/lib/db";
import { getLoanRules, evaluateApplication } from "@/lib/rules-engine";
import { encrypt, hashSSN, decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { generateSchedule } from "@/lib/amortization";
import { advanceFundedEmail } from "@/lib/emails/advance-funded";
import { applicationSubmittedEmail } from "@/lib/emails/application-submitted";
import { applicationApprovedEmail } from "@/lib/emails/application-approved";
import { applicationRejectedEmail } from "@/lib/emails/application-rejected";
import { sendEmail } from "@/lib/emails/send";
import {
  applicationSubmittedSms,
  applicationApprovedSms,
  advanceFundedSms,
} from "@/lib/sms/transactional";
import { sendSms } from "@/lib/sms/twilio";

function generateApplicationCode(): string {
  return uuidv4().replace(/-/g, "").substring(0, 8).toUpperCase();
}

const submitSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  loanAmount: z.number().positive("Loan amount must be positive"),
  loanTermMonths: z.number().int().min(3).max(18),
  platform: z.string().optional(),
  ssnRaw: z.string().optional(),
  plaidAccessToken: z.string().min(1, "Bank link is required"),
  plaidItemId: z.string().min(1, "Bank link is required"),
  plaidAccountId: z.string().optional(),
  plaidUserToken: z.string().optional(),
  identityNeedsReview: z.boolean().optional(),
  plaidIdentityName: z.string().optional(),
  workerType: z.string().optional(),
  workStartMonth: z.number().int().min(1).max(12).optional(),
  workStartYear: z.number().int().min(1900).max(2100).optional(),
  addressStreet: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressZip: z.string().optional(),
  dateOfBirth: z.string().optional(),
  bankName: z.string().optional(),
  bankRoutingNumberManual: z.string().optional(),
  bankAccountNumberManual: z.string().optional(),
});

export async function submitApplication(input: z.infer<typeof submitSchema>) {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const rules = await getLoanRules();
  const loanLimit = parseFloat(rules.loan_limit || "10000");

  if (parsed.data.loanAmount > loanLimit) {
    return {
      error: `Loan amount cannot exceed $${loanLimit.toLocaleString()}`,
    };
  }

  const data = parsed.data;

  const ssnEncrypted = data.ssnRaw ? encrypt(data.ssnRaw) : null;
  const ssnHash = data.ssnRaw ? hashSSN(data.ssnRaw) : null;

  if (ssnHash) {
    const existing = await prisma.application.findFirst({
      where: { ssnHash, status: { in: ["PENDING", "APPROVED"] } },
    });
    if (existing) {
      return { success: false, error: "An application with this SSN is already in progress." };
    }
  }

  const applicationCode = generateApplicationCode();

  const application = await prisma.application.create({
    data: {
      applicationCode,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      loanAmount: data.loanAmount,
      loanTermMonths: data.loanTermMonths,
      platform: data.platform || null,
      ssnEncrypted,
      ssnHash,
      plaidAccessToken: data.plaidAccessToken,
      plaidAccountId: data.plaidAccountId || null,
      plaidItemId: data.plaidItemId,
      plaidUserToken: data.plaidUserToken || null,
      identityNeedsReview: data.identityNeedsReview ?? false,
      plaidIdentityName: data.plaidIdentityName || null,
      workerType: data.workerType || null,
      workStartMonth: data.workStartMonth ?? null,
      workStartYear: data.workStartYear ?? null,
      addressStreet: data.addressStreet || null,
      addressCity: data.addressCity || null,
      addressState: data.addressState || null,
      addressZip: data.addressZip || null,
      dateOfBirth: data.dateOfBirth || null,
      bankName: data.bankName || null,
      bankRoutingNumberManual: data.bankRoutingNumberManual || null,
      // Encrypt the manually-entered account number with the same key used
      // for Plaid access tokens — it's a sensitive identifier we shouldn't
      // store in plaintext.
      bankAccountNumberManual: data.bankAccountNumberManual
        ? encrypt(data.bankAccountNumberManual)
        : null,
    },
  });

  // Best-effort: pre-fetch verified income/balance and create the Increase
  // external account so admin gets a fully-prepped row when they review.
  // Each underlying action persists its own failure state on the row;
  // exceptions here are swallowed so they don't block the applicant.
  try {
    const { fetchAndStoreIncome, ensureIncreaseExternalAccount } = await import("@/actions/plaid");
    await Promise.allSettled([
      fetchAndStoreIncome(application.id),
      ensureIncreaseExternalAccount(application.id),
    ]);
  } catch (err) {
    console.error("Post-submit Plaid pipeline failed:", err);
  }

  // Update linked contact stage (drives server-side conversion + activity log).
  // Transactional submit email/SMS fire directly below, not via stage sequence.
  let linkedContactId: string | null = null;
  try {
    const { updateContactStage } = await import("@/actions/contacts");
    const linked = await prisma.contact.findUnique({
      where: { email: data.email },
      select: { id: true, stage: true },
    });
    if (linked) {
      linkedContactId = linked.id;
      if (linked.stage !== "APPLICANT") {
        await updateContactStage(linked.id, "APPLICANT");
      }
    }
  } catch (err) {
    console.error("Submit-stage update failed:", err);
  }

  // Transactional notifications. Best-effort; failures don't block the submit.
  sendEmail({
    to: application.email,
    ...applicationSubmittedEmail({
      firstName: application.firstName,
      applicationCode,
      loanAmount: Number(application.loanAmount),
    }),
  }).catch((err) => console.error("[email] submit send failed:", err));

  sendSms({
    to: application.phone,
    body: applicationSubmittedSms({
      firstName: application.firstName,
      applicationCode,
    }),
    contactId: linkedContactId ?? undefined,
  }).catch((err) => console.error("[sms] submit send failed:", err));

  return { success: true, applicationCode, applicationId: application.id };
}

export async function getApplicationByCode(code: string) {
  return prisma.application.findUnique({
    where: { applicationCode: code.toUpperCase() },
    select: {
      applicationCode: true,
      firstName: true,
      status: true,
      loanAmount: true,
      loanTermMonths: true,
      interestRate: true,
      fundedAmount: true,
      fundedAt: true,
      rejectionReason: true,
      createdAt: true,
      payments: {
        orderBy: { paymentNumber: "asc" },
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          principal: true,
          interest: true,
          lateFee: true,
          dueDate: true,
          paidAt: true,
          status: true,
        },
      },
    },
  });
}

export async function getApplications(status?: string) {
  const where = status && status !== "ALL" ? { status } : {};
  return prisma.application.findMany({
    where,
    include: { documents: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getApplicationById(id: string) {
  return prisma.application.findUnique({
    where: { id },
    include: { documents: true },
  });
}

export async function updateTotalIncome(id: string, totalIncome: number) {
  return prisma.application.update({
    where: { id },
    data: { totalIncome },
  });
}

export async function approveApplication(
  applicationId: string,
  loanTermMonths?: number
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { documents: true },
  });

  if (!application) return { success: false, error: "Application not found" };

  const evaluation = await evaluateApplication(application);

  if (evaluation.recommendation === "REJECT") {
    return {
      success: false,
      error: "Application does not meet approval criteria",
      reasons: evaluation.reasons,
    };
  }

  // Score application with risk model for rate
  const { scoreApplication } = await import("@/lib/risk-model");
  const scoring = await scoreApplication(applicationId);
  const interestRate = scoring.interestRate;

  const updatedApp = await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: "APPROVED",
      interestRate,
      loanTermMonths: loanTermMonths || application.loanTermMonths,
      approvedBy: session.user.email,
      approvedAt: new Date(),
      riskScore: scoring.riskScore,
      riskModelId: scoring.modelId,
    },
  });

  await logAudit({
    action: "APPROVE",
    entityType: "APPLICATION",
    entityId: applicationId,
    performedBy: session.user.email,
    details: {
      interestRate,
      loanTermMonths: loanTermMonths || application.loanTermMonths,
      recommendation: evaluation.recommendation,
      reasons: evaluation.reasons,
    },
  });

  // Server-side conversion fire (Google Ads OCI / Meta CAPI / TikTok / Microsoft)
  // and contact stage update. Stage sequence no longer fires APPROVED email;
  // the transactional email/SMS below send directly.
  const linkedContact = await prisma.contact.findFirst({ where: { applicationId } });
  if (linkedContact) {
    const { fireServerEvent } = await import("@/lib/tracking/server-events");
    fireServerEvent({
      eventName: "approved",
      contactId: linkedContact.id,
      applicationId,
      value: Number(application.loanAmount),
    }).catch((err) => console.error("[tracking] approved event failed:", err));
    const { updateContactStage } = await import("@/actions/contacts");
    updateContactStage(linkedContact.id, "APPROVED").catch((err) =>
      console.error("[stage] approved update failed:", err),
    );
  }

  sendEmail({
    to: application.email,
    ...applicationApprovedEmail({
      firstName: application.firstName,
      applicationCode: application.applicationCode,
      loanAmount: Number(application.loanAmount),
      interestRate,
      loanTermMonths: loanTermMonths || application.loanTermMonths,
    }),
  }).catch((err) => console.error("[email] approved send failed:", err));

  sendSms({
    to: application.phone,
    body: applicationApprovedSms({
      firstName: application.firstName,
      applicationCode: application.applicationCode,
      loanAmount: Number(application.loanAmount),
    }),
    contactId: linkedContact?.id,
  }).catch((err) => console.error("[sms] approved send failed:", err));

  return { success: true, application: updatedApp };
}

export async function rejectApplication(applicationId: string, reason: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });
  if (!application) return { success: false, error: "Application not found" };

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
    },
  });

  await logAudit({
    action: "REJECT",
    entityType: "APPLICATION",
    entityId: applicationId,
    performedBy: session.user.email,
    details: { reason },
  });

  // Move linked contact to REJECTED stage (drives stage tracking; rejection
  // email is sent directly below, not via the stage sequence).
  const linkedContact = await prisma.contact.findFirst({ where: { applicationId } });
  if (linkedContact) {
    const { updateContactStage } = await import("@/actions/contacts");
    updateContactStage(linkedContact.id, "REJECTED").catch((err) =>
      console.error("[stage] rejected update failed:", err),
    );
  }

  sendEmail({
    to: application.email,
    ...applicationRejectedEmail({
      firstName: application.firstName,
      reason,
    }),
  }).catch((err) => console.error("[email] rejected send failed:", err));

  return { success: true, application };
}

export async function revealSSN(applicationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { ssnEncrypted: true },
  });

  if (!application?.ssnEncrypted) {
    return { success: false, error: "No SSN on file" };
  }

  await logAudit({
    action: "VIEW_SSN",
    entityType: "APPLICATION",
    entityId: applicationId,
    performedBy: session.user.email,
  });

  const ssn = decrypt(application.ssnEncrypted);
  return { success: true, ssn };
}

export async function fundApplication(applicationId: string, fundedAmount: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!application) return { success: false, error: "Application not found" };
  if (application.status !== "APPROVED") {
    return { success: false, error: "Application must be APPROVED to fund" };
  }

  const interestRate = Number(application.interestRate);
  const loanTermMonths = application.loanTermMonths;

  if (!interestRate || !loanTermMonths) {
    return { success: false, error: "Missing interest rate or loan term" };
  }

  // Generate amortization schedule
  const schedule = generateSchedule(fundedAmount, interestRate, loanTermMonths);

  // Update application and create payments in a transaction
  await prisma.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        status: "ACTIVE",
        fundedAt: new Date(),
        fundedAmount,
      },
    });

    await tx.payment.createMany({
      data: schedule.map((entry) => ({
        applicationId,
        amount: entry.amount,
        principal: entry.principal,
        interest: entry.interest,
        dueDate: entry.dueDate,
        paymentNumber: entry.paymentNumber,
        status: "PENDING",
      })),
    });
  });

  await logAudit({
    action: "FUND",
    entityType: "APPLICATION",
    entityId: applicationId,
    performedBy: session.user.email,
    details: { fundedAmount, paymentsCreated: schedule.length },
  });

  // Disburse via Increase ACH (push to merchant's verified bank account)
  if (process.env.INCREASE_API_KEY) {
    try {
      const { ensureIncreaseExternalAccount } = await import("@/actions/plaid");
      const { createAchCredit } = await import("@/lib/increase");
      const ext = await ensureIncreaseExternalAccount(applicationId);
      if (!ext.ok) {
        await prisma.application.update({
          where: { id: applicationId },
          data: { increaseDisburseError: ext.error },
        });
      } else {
        const transfer = await createAchCredit({
          externalAccountId: ext.externalAccountId,
          amountCents: Math.round(fundedAmount * 100),
          statementDescriptor: "PENNYLIME ADV",
          individualName: `${application.firstName} ${application.lastName}`.slice(0, 22),
        });
        if (transfer.ok) {
          await prisma.application.update({
            where: { id: applicationId },
            data: { increaseTransferId: transfer.data.id, increaseTransferStatus: transfer.data.status },
          });
        } else {
          await prisma.application.update({
            where: { id: applicationId },
            data: { increaseDisburseError: transfer.error },
          });
        }
      }
    } catch (err) {
      await prisma.application.update({
        where: { id: applicationId },
        data: { increaseDisburseError: err instanceof Error ? err.message : "increase error" },
      }).catch(() => {});
    }
  }

  // Server-side conversion fire for funded loan
  const linkedContact = await prisma.contact.findFirst({ where: { applicationId } });
  if (linkedContact) {
    const { fireServerEvent } = await import("@/lib/tracking/server-events");
    fireServerEvent({
      eventName: "funded",
      contactId: linkedContact.id,
      applicationId,
      value: fundedAmount,
    }).catch((err) => console.error("[tracking] funded event failed:", err));
  }

  // Send funded email with schedule
  await sendEmail({
    to: application.email,
    ...advanceFundedEmail({
      firstName: application.firstName,
      applicationCode: application.applicationCode,
      fundedAmount,
      interestRate,
      loanTermMonths,
      monthlyPayment: schedule[0].amount,
      firstDueDate: schedule[0].dueDate,
      schedule,
    }),
  });

  sendSms({
    to: application.phone,
    body: advanceFundedSms({
      firstName: application.firstName,
      fundedAmount,
      firstDueDate: schedule[0].dueDate,
    }),
    contactId: linkedContact?.id,
  }).catch((err) => console.error("[sms] funded send failed:", err));

  return { success: true };
}
