// Central registry of every transactional email + SMS template.
// Powers the read-only admin preview at /admin/email/transactional.
// To edit copy, edit the underlying template file referenced in `source`.

import { applicationSubmittedEmail } from "@/lib/emails/application-submitted";
import { applicationApprovedEmail } from "@/lib/emails/application-approved";
import { applicationRejectedEmail } from "@/lib/emails/application-rejected";
import { offerReadyEmail } from "@/lib/emails/offer-ready";
import { advanceFundedEmail } from "@/lib/emails/advance-funded";
import { paymentReminderEmail } from "@/lib/emails/payment-reminder";
import { paymentSuccessEmail } from "@/lib/emails/payment-success";
import { paymentFailedEmail } from "@/lib/emails/payment-failed";
import { lateFeeAddedEmail } from "@/lib/emails/late-fee-added";
import { collectionWarningEmail } from "@/lib/emails/collection-warning";
import { collectionEscalationEmail } from "@/lib/emails/collection-escalation";
import { wrapTransactionalEmail } from "@/lib/emails/branded-wrapper";
import {
  applicationSubmittedSms,
  applicationApprovedSms,
  offerReadySms,
  advanceFundedSms,
  paymentReminderSms,
  paymentFailedSms,
  lateFeeAddedSms,
} from "@/lib/sms/transactional";

export type Channel = "email" | "sms";

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  trigger: string;
  source: string;
  channels: Channel[];
  email?: { subject: string; html: string };
  sms?: string;
}

const sampleSchedule = Array.from({ length: 6 }, (_, i) => ({
  paymentNumber: i + 1,
  dueDate: new Date(2026, 5, 1 + i * 7),
  amount: 425,
  principal: 350,
  interest: 75,
}));

export const TRANSACTIONAL_CATALOG: CatalogEntry[] = [
  {
    id: "application-submitted",
    name: "Application Submitted",
    description: "Confirmation sent right after a borrower submits an application.",
    trigger: "src/actions/applications.ts → submitApplication()",
    source: "src/lib/emails/application-submitted.ts + src/lib/sms/transactional.ts",
    channels: ["email", "sms"],
    email: applicationSubmittedEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      loanAmount: 2500,
    }),
    sms: applicationSubmittedSms({
      firstName: "Alex",
      applicationCode: "ABC12345",
    }),
  },
  {
    id: "application-approved",
    name: "Application Approved",
    description: "Sent when an admin approves an application.",
    trigger: "src/actions/applications.ts → approveApplication()",
    source: "src/lib/emails/application-approved.ts + src/lib/sms/transactional.ts",
    channels: ["email", "sms"],
    email: applicationApprovedEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      loanAmount: 2500,
      interestRate: 15,
      loanTermMonths: 6,
    }),
    sms: applicationApprovedSms({
      firstName: "Alex",
      applicationCode: "ABC12345",
      loanAmount: 2500,
    }),
  },
  {
    id: "offer-ready",
    name: "Offer Ready",
    description: "Sent the moment an admin sets offer terms on a PENDING application — includes the offer link, approved amount, and recommended weekly plan.",
    trigger: "src/actions/offers.ts → setOfferTerms() (on first PENDING→OFFERED transition)",
    source: "src/lib/emails/offer-ready.ts + src/lib/sms/transactional.ts",
    channels: ["email", "sms"],
    email: offerReadyEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      offerToken: "sampletoken1234567890",
      approvedAmount: 2500,
      weeklyRate: 5,
      recommendedDurationWeeks: 10,
      recommendedWeeklyRemittance: 407.22,
      recommendedTotalRepaid: 4072.20,
    }),
    sms: offerReadySms({
      firstName: "Alex",
      applicationCode: "ABC12345",
      offerToken: "sampletoken1234567890",
      approvedAmount: 2500,
    }),
  },
  {
    id: "application-rejected",
    name: "Application Rejected",
    description: "Sent when an admin rejects an application. Email only — no SMS to keep the tone careful.",
    trigger: "src/actions/applications.ts → rejectApplication()",
    source: "src/lib/emails/application-rejected.ts",
    channels: ["email"],
    email: applicationRejectedEmail({
      firstName: "Alex",
      reason: "Verified income below current minimum for the requested amount.",
    }),
  },
  {
    id: "advance-funded",
    name: "Advance Funded",
    description: "Sent when an admin funds an approved advance. Includes full remittance schedule.",
    trigger: "src/actions/applications.ts → fundApplication()",
    source: "src/lib/emails/advance-funded.ts + src/lib/sms/transactional.ts",
    channels: ["email", "sms"],
    email: advanceFundedEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      fundedAmount: 2500,
      interestRate: 15,
      loanTermMonths: 6,
      monthlyPayment: 425,
      firstDueDate: sampleSchedule[0].dueDate,
      schedule: sampleSchedule,
    }),
    sms: advanceFundedSms({
      firstName: "Alex",
      fundedAmount: 2500,
      firstDueDate: sampleSchedule[0].dueDate,
    }),
  },
  {
    id: "payment-reminder",
    name: "Payment Reminder",
    description: "Sent the day before a scheduled remittance is debited.",
    trigger: "src/app/api/cron/reminders/route.ts (daily cron)",
    source: "src/lib/emails/payment-reminder.ts + src/lib/sms/transactional.ts",
    channels: ["email", "sms"],
    email: paymentReminderEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      paymentNumber: 2,
      amount: 425,
      dueDate: sampleSchedule[1].dueDate,
      remainingBalance: 2125,
    }),
    sms: paymentReminderSms({
      firstName: "Alex",
      amount: 425,
      dueDate: sampleSchedule[1].dueDate,
    }),
  },
  {
    id: "payment-success",
    name: "Payment Success",
    description: "Sent when an ACH debit settles. Email only.",
    trigger: "src/app/api/cron/payment-status/route.ts (status=posted)",
    source: "src/lib/emails/payment-success.ts",
    channels: ["email"],
    email: paymentSuccessEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      paymentNumber: 2,
      amount: 425,
      remainingBalance: 1700,
    }),
  },
  {
    id: "payment-failed",
    name: "Payment Failed",
    description: "Sent when an ACH debit fails (NSF, account closed, etc.) or initial debit can't be initiated.",
    trigger: "src/app/api/cron/payment-status/route.ts (failed) + payment-processor (Day 0)",
    source: "src/lib/emails/payment-failed.ts + src/lib/sms/transactional.ts",
    channels: ["email", "sms"],
    email: paymentFailedEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      paymentNumber: 2,
      amount: 425,
    }),
    sms: paymentFailedSms({
      firstName: "Alex",
      amount: 425,
      paymentNumber: 2,
    }),
  },
  {
    id: "late-fee-added",
    name: "Late Fee Added",
    description: "Sent when a failed payment passes the grace window and a late fee posts.",
    trigger: "src/app/api/cron/late-fees/route.ts",
    source: "src/lib/emails/late-fee-added.ts + src/lib/sms/transactional.ts",
    channels: ["email", "sms"],
    email: lateFeeAddedEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      paymentNumber: 2,
      lateFeeAmount: 25,
      originalAmount: 425,
      totalDue: 450,
    }),
    sms: lateFeeAddedSms({
      firstName: "Alex",
      lateFeeAmount: 25,
      totalDue: 450,
      paymentNumber: 2,
    }),
  },
  {
    id: "collection-warning",
    name: "Collection Warning",
    description: "First / second warning sent as a remittance falls further behind (pre-collections).",
    trigger: "src/app/api/cron/collections/route.ts",
    source: "src/lib/emails/collection-warning.ts",
    channels: ["email"],
    email: collectionWarningEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      daysOverdue: 14,
      totalOverdue: 450,
      isSecondWarning: true,
    }),
  },
  {
    id: "collection-escalation",
    name: "Collection Escalation",
    description: "Final notice sent when a delinquent advance is moved to collections (30+ days overdue).",
    trigger: "src/app/api/cron/collections/route.ts",
    source: "src/lib/emails/collection-escalation.ts",
    channels: ["email"],
    email: collectionEscalationEmail({
      firstName: "Alex",
      applicationCode: "ABC12345",
      totalOverdue: 1275,
    }),
  },
];

// Wrap every email's HTML in the branded shell so previews match what
// recipients actually see (sendEmail() applies the same wrapper at send time).
for (const entry of TRANSACTIONAL_CATALOG) {
  if (entry.email) {
    entry.email = {
      subject: entry.email.subject,
      html: wrapTransactionalEmail(entry.email.html),
    };
  }
}

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return TRANSACTIONAL_CATALOG.find((e) => e.id === id);
}
