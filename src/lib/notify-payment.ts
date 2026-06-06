/**
 * Helpers that build + fire admin notification emails for the three
 * Payment lifecycle events: settled, failed, initiated.
 *
 * Centralised so the Increase webhook (push path) and the
 * payment-status / payment-processor crons (pull paths) all emit
 * identical messages without duplicating the HTML template.
 */

import { notifyAdmins, getAdminUrl } from "@/lib/notify";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface PaymentNotificationContext {
  applicationId: string;
  applicationCode: string;
  borrowerName: string;
  paymentNumber: number;
  amount: number;
  source: "webhook" | "cron" | "manual";
}

export async function notifyPaymentSettled(ctx: PaymentNotificationContext) {
  const url = `${getAdminUrl()}/admin/applications/${ctx.applicationId}`;
  return notifyAdmins("paymentSettled", {
    subject: `Payment settled, ${fmtMoney(ctx.amount)} from ${ctx.borrowerName}`,
    html: `<p><strong>${escapeHtml(ctx.borrowerName)}</strong> just settled remittance #${ctx.paymentNumber} for <strong>${fmtMoney(ctx.amount)}</strong>.</p>
<ul>
  <li>Application: <code>${escapeHtml(ctx.applicationCode)}</code></li>
  <li>Detected via: ${ctx.source}</li>
</ul>
<p><a href="${url}">Open application in admin</a></p>`,
  });
}

export async function notifyPaymentFailed(ctx: PaymentNotificationContext & { reason?: string | null }) {
  const url = `${getAdminUrl()}/admin/applications/${ctx.applicationId}`;
  const reasonLine = ctx.reason ? `<li>Reason: ${escapeHtml(ctx.reason)}</li>` : "";
  return notifyAdmins("paymentFailed", {
    subject: `Payment FAILED, ${fmtMoney(ctx.amount)} from ${ctx.borrowerName}`,
    html: `<p><strong>${escapeHtml(ctx.borrowerName)}</strong>'s remittance #${ctx.paymentNumber} for <strong>${fmtMoney(ctx.amount)}</strong> didn't go through.</p>
<ul>
  <li>Application: <code>${escapeHtml(ctx.applicationCode)}</code></li>
  <li>Detected via: ${ctx.source}</li>
  ${reasonLine}
</ul>
<p>You can hit <a href="${url}">Recharge now</a> or email the borrower from the admin to ask when to retry.</p>`,
  });
}

export async function notifyPaymentInitiated(ctx: PaymentNotificationContext) {
  const url = `${getAdminUrl()}/admin/applications/${ctx.applicationId}`;
  return notifyAdmins("paymentInitiated", {
    subject: `ACH debit initiated, ${fmtMoney(ctx.amount)} from ${ctx.borrowerName}`,
    html: `<p>We just initiated remittance #${ctx.paymentNumber} for <strong>${fmtMoney(ctx.amount)}</strong> from <strong>${escapeHtml(ctx.borrowerName)}</strong>.</p>
<ul>
  <li>Application: <code>${escapeHtml(ctx.applicationCode)}</code></li>
  <li>Triggered by: ${ctx.source}</li>
</ul>
<p><a href="${url}">View application</a></p>`,
  });
}
