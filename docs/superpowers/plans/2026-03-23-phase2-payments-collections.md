# Phase 2: Payments & Collections Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build automated ACH payment collection via Plaid Transfer, payment scheduling with amortization, daily retry logic, late fees, and collections escalation.

**Architecture:** When a loan is funded, the system generates a full amortization schedule as Payment records. Cron jobs (API routes protected by CRON_SECRET) handle daily ACH initiation via Plaid Transfer, settlement polling, retries, late fees, reminders, and collections escalation. Admin can manually retry payments and waive late fees. Borrower status page shows full payment history.

**Tech Stack:** Plaid Transfer API (ACH debit), Prisma (Payment, CollectionEvent models already exist), Resend (payment lifecycle emails), Next.js API routes (cron endpoints)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/amortization.ts` | Pure amortization math: generate payment schedule from principal, rate, term |
| `src/lib/plaid-transfer.ts` | Plaid Transfer API wrapper: initiate ACH debit, check transfer status |
| `src/lib/cron-auth.ts` | Verify CRON_SECRET header for cron route protection |
| `src/actions/payments.ts` | Payment CRUD: get payments, retry payment, waive late fee, get borrower payment summary |
| `src/lib/emails/loan-funded.ts` | Funding confirmation email with payment schedule |
| `src/lib/emails/payment-reminder.ts` | Payment due tomorrow reminder |
| `src/lib/emails/payment-success.ts` | Payment successful confirmation |
| `src/lib/emails/payment-failed.ts` | Payment failed notification |
| `src/lib/emails/late-fee-added.ts` | Late fee applied notification |
| `src/lib/emails/collection-warning.ts` | 7-day and 14-day overdue warnings |
| `src/lib/emails/collection-escalation.ts` | 30-day collections escalation final notice |
| `src/app/api/cron/payment-processor/route.ts` | Daily 6am: initiate ACH for due payments |
| `src/app/api/cron/payment-status/route.ts` | Every 4h: poll Plaid for settlement |
| `src/app/api/cron/payment-retry/route.ts` | Daily 8am: retry failed payments |
| `src/app/api/cron/late-fees/route.ts` | Daily midnight: add late fees to overdue payments |
| `src/app/api/cron/reminders/route.ts` | Daily 9am: email reminders for tomorrow's payments |
| `src/app/api/cron/collections/route.ts` | Daily midnight: escalate 30+ day overdue |
| `src/app/admin/payments/payments-client.tsx` | Admin payments overview page |
| `src/app/admin/payments/page.tsx` | Server component for payments page |

### Modified Files
| File | Changes |
|------|---------|
| `src/actions/applications.ts` | Update `fundApplication` to generate payment schedule and send funded email |
| `src/lib/audit.ts` | Add new audit actions: `RETRY_PAYMENT`, `ADD_LATE_FEE`, `COLLECTIONS_ESCALATION`, `PAYMENT_RECEIVED`, `INITIATE_ACH` |
| `src/app/admin/applications/[id]/detail-client.tsx` | Add payment schedule table, retry button, waive fee button |
| `src/components/status-display.tsx` | Expand to show payment schedule, balance, next payment for active loans |
| `src/actions/applications.ts:getApplicationByCode` | Return more fields for active loans (payments, interestRate, loanTermMonths, fundedAmount) |
| `src/components/admin-sidebar.tsx` | Add "Payments" nav item |
| `src/middleware.ts` | Add `/admin/payments/:path*` to matcher |

---

## Chunk 1: Core Payment Infrastructure

### Task 1: Amortization Library

**Files:**
- Create: `src/lib/amortization.ts`

- [ ] **Step 1: Create amortization calculation module**

Create `src/lib/amortization.ts`:

```typescript
export interface ScheduleEntry {
  paymentNumber: number;
  dueDate: Date;
  amount: number;
  principal: number;
  interest: number;
}

/**
 * Generate a full amortization schedule.
 * @param fundedAmount - loan principal
 * @param annualRate - annual interest rate as percentage (e.g. 30 for 30%)
 * @param termMonths - number of monthly payments
 * @param firstDueDate - date of first payment (default: 30 days from now)
 * @returns array of ScheduleEntry, one per month
 */
export function generateSchedule(
  fundedAmount: number,
  annualRate: number,
  termMonths: number,
  firstDueDate?: Date
): ScheduleEntry[] {
  const monthlyRate = annualRate / 100 / 12;
  const monthlyPayment =
    (fundedAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths))) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);

  const schedule: ScheduleEntry[] = [];
  let balance = fundedAmount;

  const startDate = firstDueDate ?? new Date();
  if (!firstDueDate) {
    startDate.setDate(startDate.getDate() + 30);
  }

  for (let i = 1; i <= termMonths; i++) {
    const interest = balance * monthlyRate;
    const principal = i === termMonths ? balance : monthlyPayment - interest;
    const amount = i === termMonths ? balance + interest : monthlyPayment;

    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    schedule.push({
      paymentNumber: i,
      dueDate,
      amount: Math.round(amount * 100) / 100,
      principal: Math.round(principal * 100) / 100,
      interest: Math.round(interest * 100) / 100,
    });

    balance -= principal;
  }

  return schedule;
}

/**
 * Calculate remaining balance from a list of payments.
 */
export function calculateRemainingBalance(
  payments: { principal: number; status: string }[]
): number {
  const paidPrincipal = payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + Number(p.principal), 0);
  const totalPrincipal = payments.reduce((sum, p) => sum + Number(p.principal), 0);
  return Math.round((totalPrincipal - paidPrincipal) * 100) / 100;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/amortization.ts
git commit -m "feat: add amortization schedule generation library"
```

---

### Task 2: Update Audit Types

**Files:**
- Modify: `src/lib/audit.ts`

- [ ] **Step 1: Add new audit action and entity types**

In `src/lib/audit.ts`, **replace** the existing `AuditAction` type definition (which already includes actions like `WAIVE_FEE`) with this expanded version that adds payment-related actions:

```typescript
export type AuditAction =
  | "APPROVE"
  | "REJECT"
  | "FUND"
  | "EDIT_INCOME"
  | "VIEW_SSN"
  | "CHANGE_SETTING"
  | "LOGIN"
  | "WAIVE_FEE"
  | "RETRY_PAYMENT"
  | "ADD_LATE_FEE"
  | "COLLECTIONS_ESCALATION"
  | "PAYMENT_RECEIVED"
  | "INITIATE_ACH";
```

No other changes needed — `AuditEntityType` already has `"PAYMENT"`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/audit.ts
git commit -m "feat: add payment-related audit action types"
```

---

### Task 3: Plaid Transfer Integration Library

**Files:**
- Create: `src/lib/plaid-transfer.ts`

- [ ] **Step 1: Create Plaid Transfer wrapper**

Create `src/lib/plaid-transfer.ts`:

```typescript
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/db";
import { TransferAuthorizationDecisionRationale } from "plaid";

/**
 * Initiate an ACH debit via Plaid Transfer for a payment.
 * Returns the transfer ID on success, or an error message.
 */
export async function initiateACHDebit(paymentId: string): Promise<
  { success: true; transferId: string } | { success: false; error: string }
> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { application: true },
  });

  if (!payment) return { success: false, error: "Payment not found" };
  if (!payment.application.plaidAccessToken) {
    return { success: false, error: "No Plaid connection" };
  }

  const accessToken = decrypt(payment.application.plaidAccessToken);
  const accountId = payment.application.plaidAccountId;
  if (!accountId) return { success: false, error: "No Plaid account ID" };

  const totalAmount = Number(payment.amount) + Number(payment.lateFee);

  try {
    // Step 1: Authorize the transfer
    const authResponse = await plaidClient.transferAuthorizationCreate({
      access_token: accessToken,
      account_id: accountId,
      type: "debit",
      network: "ach",
      amount: totalAmount.toFixed(2),
      ach_class: "web",
      user: {
        legal_name: `${payment.application.firstName} ${payment.application.lastName}`,
      },
    });

    const authorization = authResponse.data.authorization;
    if (authorization.decision !== "approved") {
      const rationale = authorization.decision_rationale as TransferAuthorizationDecisionRationale | null;
      return {
        success: false,
        error: `Transfer not authorized: ${rationale?.description || authorization.decision}`,
      };
    }

    // Step 2: Create the transfer
    const transferResponse = await plaidClient.transferCreate({
      access_token: accessToken,
      account_id: accountId,
      authorization_id: authorization.id,
      amount: totalAmount.toFixed(2),
      description: `Payment #${payment.paymentNumber}`,
    });

    return { success: true, transferId: transferResponse.data.transfer.id };
  } catch (error) {
    console.error("Plaid Transfer error:", error);
    return { success: false, error: "ACH transfer initiation failed" };
  }
}

/**
 * Check the status of a Plaid Transfer.
 * Returns "posted" (success), "failed", "cancelled", or "pending" (still processing).
 */
export async function checkTransferStatus(
  transferId: string
): Promise<"posted" | "failed" | "cancelled" | "pending"> {
  try {
    const response = await plaidClient.transferGet({ transfer_id: transferId });
    const status = response.data.transfer.status;

    if (status === "posted" || status === "settled") return "posted";
    if (status === "failed" || status === "returned") return "failed";
    if (status === "cancelled") return "cancelled";
    return "pending"; // still in transit
  } catch (error) {
    console.error("Plaid Transfer status check error:", error);
    return "pending"; // safe default: don't mark as failed on API error
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/plaid-transfer.ts
git commit -m "feat: add Plaid Transfer ACH debit integration"
```

---

### Task 4: Cron Auth Helper

**Files:**
- Create: `src/lib/cron-auth.ts`

- [ ] **Step 1: Create cron secret verification helper**

Create `src/lib/cron-auth.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

/**
 * Verify that a cron request has the correct CRON_SECRET header.
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const secret = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/cron-auth.ts
git commit -m "feat: add cron secret verification helper"
```

---

### Task 5: Update fundApplication to Generate Payment Schedule

**Files:**
- Modify: `src/actions/applications.ts`
- Create: `src/lib/emails/loan-funded.ts`

- [ ] **Step 1: Create loan-funded email template**

Create `src/lib/emails/loan-funded.ts`:

```typescript
import { APP_URL } from "@/lib/email";
import type { ScheduleEntry } from "@/lib/amortization";

export function loanFundedEmail(params: {
  firstName: string;
  applicationCode: string;
  fundedAmount: number;
  interestRate: number;
  loanTermMonths: number;
  monthlyPayment: number;
  firstDueDate: Date;
  schedule: ScheduleEntry[];
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const scheduleRows = params.schedule
    .map(
      (p) =>
        `<tr>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb;">#${p.paymentNumber}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb;">${p.dueDate.toLocaleDateString()}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #e5e7eb;">$${p.amount.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  return {
    subject: "Your Loan Has Been Funded — Payment Schedule Inside",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Your Loan Has Been Funded!</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your loan of <strong>$${params.fundedAmount.toLocaleString()}</strong> has been funded. Below are your loan details and payment schedule.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Funded Amount</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.fundedAmount.toLocaleString()}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Interest Rate</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.interestRate}% APR</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Term</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.loanTermMonths} months</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Monthly Payment</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.monthlyPayment.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">First Payment Due</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.firstDueDate.toLocaleDateString()}</td></tr>
        </table>
        <h3>Payment Schedule</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 6px 12px; text-align: left;">#</th>
              <th style="padding: 6px 12px; text-align: left;">Due Date</th>
              <th style="padding: 6px 12px; text-align: left;">Amount</th>
            </tr>
          </thead>
          <tbody>${scheduleRows}</tbody>
        </table>
        <p>Payments will be automatically debited from your linked bank account on each due date.</p>
        <p>Track your loan: <a href="${statusUrl}" style="color: #16a34a;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

- [ ] **Step 2: Update fundApplication to generate schedule and send email**

In `src/actions/applications.ts`, add the import at the top:

```typescript
import { generateSchedule } from "@/lib/amortization";
import { loanFundedEmail } from "@/lib/emails/loan-funded";
import { sendEmail } from "@/lib/emails/send";
```

Then replace the `fundApplication` function body. After the existing status update to ACTIVE, add payment schedule generation:

```typescript
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

  // Send funded email with schedule
  await sendEmail({
    to: application.email,
    ...loanFundedEmail({
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

  return { success: true };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/emails/loan-funded.ts src/actions/applications.ts
git commit -m "feat: generate payment schedule on fund and send funded email"
```

---

### Task 6: Payment Management Actions

**Files:**
- Create: `src/actions/payments.ts`

- [ ] **Step 1: Create payment actions**

Create `src/actions/payments.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getPaymentsByApplicationId(applicationId: string) {
  return prisma.payment.findMany({
    where: { applicationId },
    orderBy: { paymentNumber: "asc" },
  });
}

export async function getPaymentsSummary(applicationId: string) {
  const payments = await prisma.payment.findMany({
    where: { applicationId },
    orderBy: { paymentNumber: "asc" },
  });

  const totalOwed = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalPaid = payments
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalLateFees = payments.reduce((s, p) => s + Number(p.lateFee), 0);
  const nextPayment = payments.find(
    (p) => p.status === "PENDING" || p.status === "FAILED"
  );
  const remainingBalance = totalOwed - totalPaid;

  return {
    payments,
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalLateFees: Math.round(totalLateFees * 100) / 100,
    remainingBalance: Math.round(remainingBalance * 100) / 100,
    nextPayment,
  };
}

export async function retryPayment(paymentId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) return { success: false, error: "Payment not found" };
  if (payment.status !== "FAILED" && payment.status !== "LATE" && payment.status !== "COLLECTIONS") {
    return { success: false, error: "Payment cannot be retried in current status" };
  }

  // Mark as PROCESSING so cron doesn't double-debit
  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: "PROCESSING",
      retryCount: { increment: 1 },
      lastRetryAt: new Date(),
    },
  });

  // Initiate the ACH debit
  const { initiateACHDebit } = await import("@/lib/plaid-transfer");
  const result = await initiateACHDebit(paymentId);

  if (result.success) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { achTransferId: result.transferId },
    });
  } else {
    // Revert to FAILED if ACH initiation fails
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "FAILED" },
    });
    return { success: false, error: result.error };
  }

  await logAudit({
    action: "RETRY_PAYMENT",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: session.user.email,
    details: { applicationId: payment.applicationId, paymentNumber: payment.paymentNumber },
  });

  return { success: true };
}

export async function waiveLateFee(paymentId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  if (!payment) return { success: false, error: "Payment not found" };
  if (Number(payment.lateFee) === 0) {
    return { success: false, error: "No late fee to waive" };
  }

  const waivedAmount = Number(payment.lateFee);

  await prisma.payment.update({
    where: { id: paymentId },
    data: { lateFee: 0 },
  });

  await logAudit({
    action: "WAIVE_FEE",
    entityType: "PAYMENT",
    entityId: paymentId,
    performedBy: session.user.email,
    details: { waivedAmount, applicationId: payment.applicationId },
  });

  return { success: true, waivedAmount };
}

/**
 * Get all payments across all applications, optionally filtered by status.
 * Used by the admin payments overview page.
 */
export async function getAllPayments(status?: string) {
  const where = status && status !== "ALL" ? { status } : {};
  return prisma.payment.findMany({
    where,
    include: {
      application: {
        select: {
          firstName: true,
          lastName: true,
          applicationCode: true,
          email: true,
        },
      },
    },
    orderBy: { dueDate: "asc" },
    take: 200,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/payments.ts
git commit -m "feat: add payment management actions (list, retry, waive fee)"
```

---

### Task 7: Payment Email Templates

**Files:**
- Create: `src/lib/emails/payment-reminder.ts`
- Create: `src/lib/emails/payment-success.ts`
- Create: `src/lib/emails/payment-failed.ts`
- Create: `src/lib/emails/late-fee-added.ts`
- Create: `src/lib/emails/collection-warning.ts`
- Create: `src/lib/emails/collection-escalation.ts`

- [ ] **Step 1: Create all payment email templates**

Create `src/lib/emails/payment-reminder.ts`:

```typescript
import { APP_URL } from "@/lib/email";

export function paymentReminderEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
  dueDate: Date;
  remainingBalance: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: `Payment Reminder: $${params.amount.toFixed(2)} due ${params.dueDate.toLocaleDateString()}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Payment Reminder</h2>
        <p>Hi ${params.firstName},</p>
        <p>This is a reminder that your payment #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong> is due on <strong>${params.dueDate.toLocaleDateString()}</strong>.</p>
        <p>The payment will be automatically debited from your linked bank account.</p>
        <p>Remaining balance: <strong>$${params.remainingBalance.toFixed(2)}</strong></p>
        <p>View your loan: <a href="${statusUrl}" style="color: #2563eb;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

Create `src/lib/emails/payment-success.ts`:

```typescript
import { APP_URL } from "@/lib/email";

export function paymentSuccessEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
  remainingBalance: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: `Payment Received: $${params.amount.toFixed(2)} — Thank You`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Payment Received</h2>
        <p>Hi ${params.firstName},</p>
        <p>We've received your payment #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong>. Thank you!</p>
        <p>Remaining balance: <strong>$${params.remainingBalance.toFixed(2)}</strong></p>
        ${params.remainingBalance <= 0 ? '<p style="color: #16a34a; font-weight: bold;">Congratulations! Your loan is fully paid off!</p>' : ""}
        <p>View your loan: <a href="${statusUrl}" style="color: #16a34a;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

Create `src/lib/emails/payment-failed.ts`:

```typescript
import { APP_URL } from "@/lib/email";

export function paymentFailedEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  amount: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: "Payment Failed — Action May Be Required",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Payment Failed</h2>
        <p>Hi ${params.firstName},</p>
        <p>We were unable to process your payment #${params.paymentNumber} of <strong>$${params.amount.toFixed(2)}</strong>.</p>
        <p>We will automatically retry the payment. Please ensure your bank account has sufficient funds.</p>
        <p>If your bank connection needs to be updated, please contact us.</p>
        <p>View your loan: <a href="${statusUrl}" style="color: #dc2626;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

Create `src/lib/emails/late-fee-added.ts`:

```typescript
import { APP_URL } from "@/lib/email";

export function lateFeeAddedEmail(params: {
  firstName: string;
  applicationCode: string;
  paymentNumber: number;
  lateFeeAmount: number;
  originalAmount: number;
  totalDue: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: `Late Fee Applied: $${params.lateFeeAmount.toFixed(2)}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ea580c;">Late Fee Applied</h2>
        <p>Hi ${params.firstName},</p>
        <p>A late fee of <strong>$${params.lateFeeAmount.toFixed(2)}</strong> has been applied to your overdue payment #${params.paymentNumber}.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Original Payment</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.originalAmount.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Late Fee</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #ea580c;">$${params.lateFeeAmount.toFixed(2)}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Total Due</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.totalDue.toFixed(2)}</td></tr>
        </table>
        <p>Please ensure your bank account has sufficient funds. We will continue to attempt collection.</p>
        <p>View your loan: <a href="${statusUrl}" style="color: #ea580c;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

Create `src/lib/emails/collection-warning.ts`:

```typescript
import { APP_URL } from "@/lib/email";

export function collectionWarningEmail(params: {
  firstName: string;
  applicationCode: string;
  daysOverdue: number;
  totalOverdue: number;
  isSecondWarning: boolean;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const urgency = params.isSecondWarning ? "URGENT" : "IMPORTANT";
  return {
    subject: `${urgency}: Your Loan Payment is ${params.daysOverdue} Days Overdue`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">${params.isSecondWarning ? "Second Warning" : "Formal Warning"}: Payment Overdue</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your loan payment is now <strong>${params.daysOverdue} days overdue</strong>. The total outstanding amount is <strong>$${params.totalOverdue.toFixed(2)}</strong>.</p>
        ${params.isSecondWarning
          ? "<p><strong>This is your second warning.</strong> If payment is not received within 16 days, your account will be escalated to collections.</p>"
          : "<p>Please arrange payment as soon as possible to avoid additional late fees and potential escalation to collections.</p>"
        }
        <p>View your loan: <a href="${statusUrl}" style="color: #dc2626;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

Create `src/lib/emails/collection-escalation.ts`:

```typescript
import { APP_URL } from "@/lib/email";

export function collectionEscalationEmail(params: {
  firstName: string;
  applicationCode: string;
  totalOverdue: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  return {
    subject: "FINAL NOTICE: Your Account Has Been Sent to Collections",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Account Sent to Collections</h2>
        <p>Hi ${params.firstName},</p>
        <p>Your loan account has been escalated to collections due to non-payment for over 30 days. The total outstanding amount is <strong>$${params.totalOverdue.toFixed(2)}</strong>.</p>
        <p>Automatic payment retries have been suspended. A representative will be in contact regarding your account.</p>
        <p>To resolve this matter, please contact us immediately.</p>
        <p>View your loan: <a href="${statusUrl}" style="color: #dc2626;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/emails/payment-reminder.ts src/lib/emails/payment-success.ts src/lib/emails/payment-failed.ts src/lib/emails/late-fee-added.ts src/lib/emails/collection-warning.ts src/lib/emails/collection-escalation.ts
git commit -m "feat: add payment lifecycle email templates"
```

---

## Chunk 2: Cron Jobs

### Task 8: Payment Processor Cron (Daily 6am)

**Files:**
- Create: `src/app/api/cron/payment-processor/route.ts`

- [ ] **Step 1: Create payment processor cron route**

Create `src/app/api/cron/payment-processor/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { initiateACHDebit } from "@/lib/plaid-transfer";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { paymentFailedEmail } from "@/lib/emails/payment-failed";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Find all PENDING payments due today or earlier
  const duePayments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      dueDate: { lte: today },
    },
    include: { application: true },
  });

  const results: { paymentId: string; success: boolean; error?: string }[] = [];

  for (const payment of duePayments) {
    // Set to PROCESSING first to prevent double-debit
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PROCESSING" },
    });

    const result = await initiateACHDebit(payment.id);

    if (result.success) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { achTransferId: result.transferId },
      });

      await logAudit({
        action: "INITIATE_ACH",
        entityType: "PAYMENT",
        entityId: payment.id,
        performedBy: "system:payment-processor",
        details: { transferId: result.transferId, amount: Number(payment.amount) },
      });

      results.push({ paymentId: payment.id, success: true });
    } else {
      // Revert to FAILED if ACH initiation fails
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", retryCount: { increment: 1 }, lastRetryAt: new Date() },
      });

      // Send failure email to borrower (spec: Day 0 failure notification)
      await sendEmail({
        to: payment.application.email,
        ...paymentFailedEmail({
          firstName: payment.application.firstName,
          applicationCode: payment.application.applicationCode,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount),
        }),
      });

      results.push({ paymentId: payment.id, success: false, error: result.error });
    }
  }

  return NextResponse.json({
    processed: duePayments.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/payment-processor/route.ts
git commit -m "feat: add payment processor cron (initiate ACH for due payments)"
```

---

### Task 9: Payment Status Check Cron (Every 4h)

**Files:**
- Create: `src/app/api/cron/payment-status/route.ts`

- [ ] **Step 1: Create payment status check cron route**

Create `src/app/api/cron/payment-status/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { checkTransferStatus } from "@/lib/plaid-transfer";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { paymentSuccessEmail } from "@/lib/emails/payment-success";
import { paymentFailedEmail } from "@/lib/emails/payment-failed";
import { calculateRemainingBalance } from "@/lib/amortization";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  // Find all PROCESSING payments with a transfer ID
  const processingPayments = await prisma.payment.findMany({
    where: {
      status: "PROCESSING",
      achTransferId: { not: null },
    },
    include: {
      application: {
        include: { payments: true },
      },
    },
  });

  let settled = 0;
  let failed = 0;
  let pending = 0;

  for (const payment of processingPayments) {
    const status = await checkTransferStatus(payment.achTransferId!);

    if (status === "posted") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", paidAt: new Date() },
      });

      await logAudit({
        action: "PAYMENT_RECEIVED",
        entityType: "PAYMENT",
        entityId: payment.id,
        performedBy: "system:payment-status",
        details: { amount: Number(payment.amount) + Number(payment.lateFee) },
      });

      // Calculate remaining balance (excluding this payment which is now PAID)
      const allPayments = payment.application.payments.map((p) =>
        p.id === payment.id ? { ...p, status: "PAID" } : p
      );
      const remaining = calculateRemainingBalance(
        allPayments.map((p) => ({ principal: Number(p.principal), status: p.status }))
      );

      // Check if loan is fully paid off
      if (remaining <= 0) {
        await prisma.application.update({
          where: { id: payment.applicationId },
          data: { status: "PAID_OFF" },
        });
      } else {
        // If loan was LATE and all overdue payments caught up, revert to ACTIVE
        const overduePayments = allPayments.filter(
          (p) => p.status === "FAILED" || p.status === "LATE"
        );
        if (overduePayments.length === 0 && payment.application.status === "LATE") {
          await prisma.application.update({
            where: { id: payment.applicationId },
            data: { status: "ACTIVE" },
          });
        }
      }

      // Send success email
      await sendEmail({
        to: payment.application.email,
        ...paymentSuccessEmail({
          firstName: payment.application.firstName,
          applicationCode: payment.application.applicationCode,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount) + Number(payment.lateFee),
          remainingBalance: remaining,
        }),
      });

      settled++;
    } else if (status === "failed" || status === "cancelled") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      });

      // Send failure email
      await sendEmail({
        to: payment.application.email,
        ...paymentFailedEmail({
          firstName: payment.application.firstName,
          applicationCode: payment.application.applicationCode,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount),
        }),
      });

      failed++;
    } else {
      pending++;
    }
  }

  return NextResponse.json({ processed: processingPayments.length, settled, failed, pending });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/payment-status/route.ts
git commit -m "feat: add payment status check cron (poll Plaid for settlement)"
```

---

### Task 10: Payment Retry Cron (Daily 8am)

**Files:**
- Create: `src/app/api/cron/payment-retry/route.ts`

- [ ] **Step 1: Create payment retry cron route**

Create `src/app/api/cron/payment-retry/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { initiateACHDebit } from "@/lib/plaid-transfer";
import { logAudit } from "@/lib/audit";
import { getLoanRules } from "@/lib/rules-engine";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const rules = await getLoanRules();
  const collectionsThresholdDays = parseInt(rules.collections_threshold_days || "30");

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - collectionsThresholdDays);

  // Find FAILED payments that are less than 30 days old (not yet in COLLECTIONS territory)
  const failedPayments = await prisma.payment.findMany({
    where: {
      status: "FAILED",
      dueDate: { gte: cutoffDate },
    },
    include: { application: true },
  });

  let retried = 0;
  let errors = 0;

  for (const payment of failedPayments) {
    // Skip if application is already in COLLECTIONS or DEFAULTED
    if (payment.application.status === "COLLECTIONS" || payment.application.status === "DEFAULTED") {
      continue;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PROCESSING" },
    });

    const result = await initiateACHDebit(payment.id);

    if (result.success) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          achTransferId: result.transferId,
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      });

      await logAudit({
        action: "RETRY_PAYMENT",
        entityType: "PAYMENT",
        entityId: payment.id,
        performedBy: "system:payment-retry",
        details: { retryCount: payment.retryCount + 1 },
      });

      retried++;
    } else {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          retryCount: { increment: 1 },
          lastRetryAt: new Date(),
        },
      });
      errors++;
    }
  }

  return NextResponse.json({ found: failedPayments.length, retried, errors });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/payment-retry/route.ts
git commit -m "feat: add payment retry cron (daily retry of failed ACH)"
```

---

### Task 11: Late Fee Calculator Cron (Daily midnight)

**Files:**
- Create: `src/app/api/cron/late-fees/route.ts`

- [ ] **Step 1: Create late fee calculator cron route**

Create `src/app/api/cron/late-fees/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { getLoanRules } from "@/lib/rules-engine";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/emails/send";
import { lateFeeAddedEmail } from "@/lib/emails/late-fee-added";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const rules = await getLoanRules();
  const lateFeeAmount = parseFloat(rules.late_fee_amount || "25");
  const graceDays = parseInt(rules.late_fee_grace_days || "3");

  const graceDate = new Date();
  graceDate.setDate(graceDate.getDate() - graceDays);
  graceDate.setHours(23, 59, 59, 999);

  // Find FAILED payments past the grace period that don't already have a late fee
  const overduePayments = await prisma.payment.findMany({
    where: {
      status: "FAILED",
      dueDate: { lte: graceDate },
      lateFee: 0,
    },
    include: { application: true },
  });

  let feesAdded = 0;

  for (const payment of overduePayments) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { lateFee: lateFeeAmount },
    });

    await logAudit({
      action: "ADD_LATE_FEE",
      entityType: "PAYMENT",
      entityId: payment.id,
      performedBy: "system:late-fees",
      details: { lateFeeAmount, daysOverdue: graceDays + 1 },
    });

    await sendEmail({
      to: payment.application.email,
      ...lateFeeAddedEmail({
        firstName: payment.application.firstName,
        applicationCode: payment.application.applicationCode,
        paymentNumber: payment.paymentNumber,
        lateFeeAmount,
        originalAmount: Number(payment.amount),
        totalDue: Number(payment.amount) + lateFeeAmount,
      }),
    });

    feesAdded++;
  }

  return NextResponse.json({ checked: overduePayments.length, feesAdded });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/late-fees/route.ts
git commit -m "feat: add late fee calculator cron (apply fees after grace period)"
```

---

### Task 12: Payment Reminders Cron (Daily 9am)

**Files:**
- Create: `src/app/api/cron/reminders/route.ts`

- [ ] **Step 1: Create payment reminders cron route**

Create `src/app/api/cron/reminders/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/emails/send";
import { paymentReminderEmail } from "@/lib/emails/payment-reminder";
import { calculateRemainingBalance } from "@/lib/amortization";

export async function POST(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  // Find payments due tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const upcomingPayments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      dueDate: { gte: tomorrow, lte: tomorrowEnd },
    },
    include: {
      application: {
        include: { payments: true },
      },
    },
  });

  let sent = 0;

  for (const payment of upcomingPayments) {
    const remaining = calculateRemainingBalance(
      payment.application.payments.map((p) => ({
        principal: Number(p.principal),
        status: p.status,
      }))
    );

    await sendEmail({
      to: payment.application.email,
      ...paymentReminderEmail({
        firstName: payment.application.firstName,
        applicationCode: payment.application.applicationCode,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        dueDate: payment.dueDate,
        remainingBalance: remaining,
      }),
    });

    sent++;
  }

  return NextResponse.json({ reminders: sent });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/reminders/route.ts
git commit -m "feat: add payment reminders cron (1-day-before email)"
```

---

### Task 13: Collections Escalation Cron (Daily midnight)

**Files:**
- Create: `src/app/api/cron/collections/route.ts`

- [ ] **Step 1: Create collections escalation cron route**

Create `src/app/api/cron/collections/route.ts`:

```typescript
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
      status: { in: ["ACTIVE", "LATE"] },
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/collections/route.ts
git commit -m "feat: add collections escalation cron (warnings and COLLECTIONS status)"
```

---

## Chunk 3: Admin & Borrower UI

### Task 14: Admin Payments Overview Page

**Files:**
- Create: `src/app/admin/payments/payments-client.tsx`
- Create: `src/app/admin/payments/page.tsx`
- Modify: `src/components/admin-sidebar.tsx`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Create payments page server component**

Create `src/app/admin/payments/page.tsx`:

```typescript
import { PaymentsClient } from "./payments-client";

export default function PaymentsPage() {
  return <PaymentsClient />;
}
```

- [ ] **Step 2: Create payments client component**

Create `src/app/admin/payments/payments-client.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAllPayments } from "@/actions/payments";

type PaymentWithApp = Awaited<ReturnType<typeof getAllPayments>>[number];

const statuses = ["ALL", "PENDING", "PROCESSING", "PAID", "FAILED", "LATE", "COLLECTIONS"];

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-500",
    PROCESSING: "bg-blue-500",
    PAID: "bg-emerald-500",
    FAILED: "bg-red-500",
    LATE: "bg-orange-500",
    COLLECTIONS: "bg-rose-500",
  };
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${colors[status] || "bg-gray-400"}`} />
  );
}

export function PaymentsClient() {
  const [payments, setPayments] = useState<PaymentWithApp[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setLoading(true);
    getAllPayments(filter).then((data) => {
      setPayments(data);
      setLoading(false);
    });
  }, [filter]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-emerald-950">Payments</h1>
        <p className="mt-1 text-[14px] text-emerald-800/50">
          View and manage all loan payments
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-all ${
              filter === s
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-emerald-900/5 text-emerald-800/60 hover:bg-emerald-900/10"
            }`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-emerald-800/40">Loading...</div>
      ) : payments.length === 0 ? (
        <div className="rounded-2xl border border-emerald-900/5 bg-white p-10 text-center">
          <p className="text-emerald-800/40">No payments found.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-emerald-900/5 bg-white">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-emerald-900/5 bg-emerald-50/50">
                <th className="px-4 py-3 text-left font-medium text-emerald-800/60">#</th>
                <th className="px-4 py-3 text-left font-medium text-emerald-800/60">Borrower</th>
                <th className="px-4 py-3 text-left font-medium text-emerald-800/60">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-emerald-800/60">Late Fee</th>
                <th className="px-4 py-3 text-left font-medium text-emerald-800/60">Due Date</th>
                <th className="px-4 py-3 text-left font-medium text-emerald-800/60">Status</th>
                <th className="px-4 py-3 text-left font-medium text-emerald-800/60">Retries</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/admin/applications/${p.applicationId}`)}
                  className="cursor-pointer border-b border-emerald-900/5 transition-colors hover:bg-emerald-50/30"
                >
                  <td className="px-4 py-3 font-mono">{p.paymentNumber}</td>
                  <td className="px-4 py-3">
                    {p.application.firstName} {p.application.lastName}
                    <span className="ml-2 text-emerald-800/40">{p.application.applicationCode}</span>
                  </td>
                  <td className="px-4 py-3 font-medium">${Number(p.amount).toFixed(2)}</td>
                  <td className="px-4 py-3">{Number(p.lateFee) > 0 ? `$${Number(p.lateFee).toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-3">{new Date(p.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot status={p.status} />
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{p.retryCount > 0 ? p.retryCount : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add Payments nav item to sidebar**

In `src/components/admin-sidebar.tsx`, add a new entry to the `navItems` array after the Dashboard entry:

```typescript
{
  href: "/admin/payments",
  label: "Payments",
  icon: (
    <svg className="size-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  ),
},
```

- [ ] **Step 4: Add payments route to middleware matcher**

In `src/middleware.ts`, update the matcher to include the payments route:

```typescript
export const config = {
  matcher: ["/admin/dashboard/:path*", "/admin/applications/:path*", "/admin/settings/:path*", "/admin/audit/:path*", "/admin/payments/:path*"],
};
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/payments/page.tsx src/app/admin/payments/payments-client.tsx src/components/admin-sidebar.tsx src/middleware.ts
git commit -m "feat: add admin payments overview page with filtering"
```

---

### Task 15: Admin Detail Page — Payment Schedule & Controls

**Files:**
- Modify: `src/app/admin/applications/[id]/detail-client.tsx`

- [ ] **Step 1: Add payment schedule, retry, and waive fee to detail page**

In `src/app/admin/applications/[id]/detail-client.tsx`, add these imports at the top:

```typescript
import { getPaymentsSummary, retryPayment, waiveLateFee } from "@/actions/payments";
```

Add state and effect for loading payments:

```typescript
const [paymentSummary, setPaymentSummary] = useState<Awaited<ReturnType<typeof getPaymentsSummary>> | null>(null);

useEffect(() => {
  if (["ACTIVE", "LATE", "COLLECTIONS", "DEFAULTED", "PAID_OFF"].includes(application.status)) {
    getPaymentsSummary(application.id).then(setPaymentSummary);
  }
}, [application.id, application.status]);
```

Add a Payment Schedule section (rendered when `paymentSummary` is not null). This section should include:

1. **Summary cards** showing: Total Owed, Total Paid, Remaining Balance, Total Late Fees
2. **Payment table** with columns: #, Due Date, Amount, Principal, Interest, Late Fee, Status, Actions
3. **Actions column** with:
   - "Retry" button for FAILED/LATE payments (calls `retryPayment(paymentId)`)
   - "Waive Fee" button for payments with lateFee > 0 (calls `waiveLateFee(paymentId)`)
4. Use `toast.success()` / `toast.error()` for action feedback
5. After any action, reload payment summary via `getPaymentsSummary(application.id)`

Style to match the existing emerald theme of the detail page. Place this section after the existing Decision section.

The section heading should be "Payment Schedule" with the payment count (e.g. "12 payments").

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/applications/[id]/detail-client.tsx
git commit -m "feat: add payment schedule view with retry and waive fee controls"
```

---

### Task 16: Borrower Status Page — Payment History

**Files:**
- Modify: `src/actions/applications.ts` (expand `getApplicationByCode`)
- Modify: `src/components/status-display.tsx`

- [ ] **Step 1: Expand getApplicationByCode to include payment data**

In `src/actions/applications.ts`, update `getApplicationByCode` to return additional fields for active loans:

```typescript
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
```

- [ ] **Step 2: Update StatusDisplay to show payment information**

Rewrite `src/components/status-display.tsx` to handle both pre-funding and post-funding states:

```typescript
"use client";

type PaymentInfo = {
  id: string;
  paymentNumber: number;
  amount: number | { toString(): string };
  principal: number | { toString(): string };
  interest: number | { toString(): string };
  lateFee: number | { toString(): string };
  dueDate: Date | string;
  paidAt: Date | string | null;
  status: string;
};

type StatusApplication = {
  applicationCode: string;
  firstName: string;
  status: string;
  loanAmount: number;
  loanTermMonths: number | null;
  interestRate: number | { toString(): string } | null;
  fundedAmount: number | { toString(): string } | null;
  fundedAt: Date | string | null;
  rejectionReason: string | null;
  createdAt: Date | string;
  payments: PaymentInfo[];
};

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    PENDING: { bg: "bg-amber-50", text: "text-amber-700", label: "Under Review" },
    APPROVED: { bg: "bg-green-50", text: "text-green-700", label: "Approved" },
    REJECTED: { bg: "bg-red-50", text: "text-red-700", label: "Rejected" },
    ACTIVE: { bg: "bg-blue-50", text: "text-blue-700", label: "Active" },
    LATE: { bg: "bg-orange-50", text: "text-orange-700", label: "Late" },
    COLLECTIONS: { bg: "bg-rose-50", text: "text-rose-700", label: "Collections" },
    DEFAULTED: { bg: "bg-red-50", text: "text-red-800", label: "Defaulted" },
    PAID_OFF: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Paid Off" },
  };
  const c = config[status] || { bg: "bg-gray-50", text: "text-gray-700", label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

export function StatusDisplay({ application }: { application: StatusApplication }) {
  const isActiveLoan = ["ACTIVE", "LATE", "COLLECTIONS", "DEFAULTED", "PAID_OFF"].includes(application.status);
  const payments = application.payments || [];

  const totalPaid = payments
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + Number(p.amount), 0);
  const totalOwed = payments.reduce((s, p) => s + Number(p.amount), 0);
  const remainingBalance = totalOwed - totalPaid;
  const totalLateFees = payments.reduce((s, p) => s + Number(p.lateFee), 0);
  const nextPayment = payments.find((p) => p.status === "PENDING" || p.status === "FAILED");

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Loan Status</h2>
          <StatusBadge status={application.status} />
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Applicant</dt>
            <dd className="font-medium mt-0.5">{application.firstName}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Loan Amount</dt>
            <dd className="font-medium mt-0.5">${Number(application.loanAmount).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Submitted</dt>
            <dd className="font-medium mt-0.5">{new Date(application.createdAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Code</dt>
            <dd className="font-mono font-medium mt-0.5">{application.applicationCode}</dd>
          </div>
          {isActiveLoan && application.interestRate && (
            <>
              <div>
                <dt className="text-gray-500">Interest Rate</dt>
                <dd className="font-medium mt-0.5">{Number(application.interestRate)}% APR</dd>
              </div>
              <div>
                <dt className="text-gray-500">Term</dt>
                <dd className="font-medium mt-0.5">{application.loanTermMonths} months</dd>
              </div>
            </>
          )}
        </dl>

        {application.status === "REJECTED" && application.rejectionReason && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Rejection Reason</p>
            <p className="mt-0.5">{application.rejectionReason}</p>
          </div>
        )}
      </div>

      {/* Balance Summary (active loans only) */}
      {isActiveLoan && payments.length > 0 && (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">Balance Summary</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Total Owed</dt>
              <dd className="text-lg font-bold mt-0.5">${totalOwed.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Total Paid</dt>
              <dd className="text-lg font-bold text-emerald-600 mt-0.5">${totalPaid.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Remaining</dt>
              <dd className="text-lg font-bold mt-0.5">${remainingBalance.toFixed(2)}</dd>
            </div>
            {totalLateFees > 0 && (
              <div>
                <dt className="text-gray-500">Late Fees</dt>
                <dd className="text-lg font-bold text-orange-600 mt-0.5">${totalLateFees.toFixed(2)}</dd>
              </div>
            )}
          </dl>
          {nextPayment && (
            <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              <p className="font-medium">Next Payment</p>
              <p className="mt-0.5">
                Payment #{nextPayment.paymentNumber}: ${Number(nextPayment.amount).toFixed(2)} due{" "}
                {new Date(nextPayment.dueDate).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Payment History (active loans only) */}
      {isActiveLoan && payments.length > 0 && (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-semibold mb-4">Payment History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Due Date</th>
                  <th className="pb-2 pr-4">Amount</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{p.paymentNumber}</td>
                    <td className="py-2 pr-4">{new Date(p.dueDate).toLocaleDateString()}</td>
                    <td className="py-2 pr-4 font-medium">
                      ${Number(p.amount).toFixed(2)}
                      {Number(p.lateFee) > 0 && (
                        <span className="ml-1 text-xs text-orange-600">+${Number(p.lateFee).toFixed(2)} fee</span>
                      )}
                    </td>
                    <td className="py-2">
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/applications.ts src/components/status-display.tsx
git commit -m "feat: expand borrower status page with payment history and balance"
```

---

### Task 17: Build and Verify Phase 2

- [ ] **Step 1: Run the build**

```bash
cd /Users/baralezrah/loan-portal
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 2: Manual verification**

1. Navigate to `/apply` — verify form still works
2. Navigate to `/admin/dashboard` — verify dashboard still loads
3. Navigate to `/admin/payments` — verify new payments page renders (empty is OK)
4. Navigate to `/admin/settings` — verify all rules display (including late_fee_amount, late_fee_grace_days, collections_threshold_days)
5. Navigate to `/status` — verify status page still works

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues for Phase 2"
```

---

## Dependency Graph

```
Task 1 (Amortization) → Task 5 (Fund + Schedule)
Task 2 (Audit Types) → Task 6 (Payment Actions)
Task 3 (Plaid Transfer) → Task 8 (Payment Processor Cron)
Task 4 (Cron Auth) → Task 8, 9, 10, 11, 12, 13 (all cron jobs)
Task 5 (Fund + Schedule) → Task 15 (Admin Detail Payment View)
Task 6 (Payment Actions) → Task 14 (Admin Payments Page), Task 15 (Admin Detail)
Task 7 (Email Templates) → Task 9, 11, 12, 13 (crons that send emails)
Task 8 (Processor) → Task 9 (Status Check)
Task 9 (Status Check) — independent after Task 3, 7
Task 10 (Retry) — independent after Task 3, 4
Task 11 (Late Fees) — independent after Task 4, 7
Task 12 (Reminders) — independent after Task 4, 7
Task 13 (Collections) — independent after Task 4, 7
Task 14 (Admin Payments) — independent after Task 6
Task 15 (Admin Detail) — independent after Task 6
Task 16 (Borrower Status) — independent (no task deps)
Task 17 (Build) — depends on all above
```

## Prerequisites from Phase 1

The following loan rules were already seeded in Phase 1 (`prisma/seed.mts`) and are required by the cron jobs:
- `late_fee_amount` = "25"
- `late_fee_grace_days` = "3"
- `collections_threshold_days` = "30"

If running against a fresh database, run `npx prisma db seed` to ensure these exist.

## Environment Variables (add to `.env`)

```
CRON_SECRET=your-cron-secret-here
```

(PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV, RESEND_API_KEY, APP_URL already configured from Phase 1)
