"use server";

import { prisma } from "@/lib/db";
import { requireNonSupportRole } from "@/lib/auth-helpers";
import { signBankUpdateToken, verifyBankUpdateToken } from "@/lib/bank-update-token";
import { bankUpdateRequestEmail } from "@/lib/emails/bank-update-request";
import { sendEmail } from "@/lib/emails/send";
import { ensureGoachBankAccount } from "@/lib/goach-provision";
import { logAudit } from "@/lib/audit";
import { APP_URL } from "@/lib/email";

/**
 * Admin action: email a paying client a secure single-purpose link to
 * re-connect their bank via Plaid. The link updates the bank on file and
 * repoints GoACH so future payments come from the new account.
 */
export async function sendBankUpdateLink(applicationId: string): Promise<
  { ok: true; sentTo: string; url: string } | { ok: false; error: string }
> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, error: auth.error };

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, firstName: true, email: true, applicationCode: true },
  });
  if (!app) return { ok: false, error: "Application not found" };
  if (!app.email) return { ok: false, error: "This client has no email on file" };

  const token = signBankUpdateToken(app.id);
  const url = `${APP_URL}/update-bank/${token}`;

  const { subject, html, preheader } = bankUpdateRequestEmail({
    firstName: app.firstName || "there",
    token,
  });
  const res = await sendEmail({ to: app.email, subject, html, preheader, templateId: "bank-update-request" });
  if (!res?.success) {
    const err = (res as { error?: unknown })?.error;
    return { ok: false, error: err instanceof Error ? err.message : "Email failed to send" };
  }

  await logAudit({
    action: "BANK_UPDATE_LINK_SENT",
    entityType: "APPLICATION",
    entityId: app.id,
    performedBy: auth.email,
    details: { sentTo: app.email, applicationCode: app.applicationCode },
  });

  return { ok: true, sentTo: app.email, url };
}

/**
 * Admin action: set a borrower's bank on file from manually-entered routing /
 * account numbers and repoint GoACH. Used when Plaid can't reach the account
 * (e.g. a Lyft Direct / Stride account the borrower moved to).
 */
export async function setGoachBankManual(input: {
  applicationId: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  checking?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireNonSupportRole();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { provisionGoachBankManual } = await import("@/lib/goach-provision");
  const r = await provisionGoachBankManual(input.applicationId, {
    routingNumber: input.routingNumber,
    accountNumber: input.accountNumber,
    bankName: input.bankName,
    checking: input.checking,
  });
  if (!r.ok) return { ok: false, error: r.error };

  await logAudit({
    action: "CHANGE_BANK",
    entityType: "APPLICATION",
    entityId: input.applicationId,
    performedBy: auth.email,
    details: {
      kind: "MANUAL_GOACH",
      bankName: input.bankName,
      routingNumber: input.routingNumber.replace(/\D/g, ""),
      accountLast4: input.accountNumber.replace(/\D/g, "").slice(-4),
      goachBankAccountUuid: r.bankAccountUuid,
    },
  });
  return { ok: true };
}

/**
 * Public (token-authed) action called from the /update-bank page after the
 * customer completes Plaid Link. Stores the new verified bank connection and
 * re-provisions GoACH with the new routing/account. Authorization comes from
 * the signed token, NOT an admin session.
 */
export async function completeBankUpdate(input: {
  token: string;
  encryptedAccessToken: string;
  itemId: string | null;
  accountId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const applicationId = verifyBankUpdateToken(input.token);
  if (!applicationId) return { ok: false, error: "This link is invalid or has expired." };
  if (!input.encryptedAccessToken) return { ok: false, error: "Bank connection was not completed." };

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, applicationCode: true },
  });
  if (!app) return { ok: false, error: "Account not found." };

  // Store the new verified Plaid connection. Clear any stale-link flag and the
  // cached asset-report token (it belongs to the old bank). Critically, null
  // goachBankAccountUuid so it can never keep pointing at the OLD bank: if the
  // re-provision below fails, the next charge rebuilds it from this new Plaid
  // connection instead of silently debiting the old account.
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      plaidAccessToken: input.encryptedAccessToken,
      plaidItemId: input.itemId || undefined,
      plaidAccountId: input.accountId || null,
      plaidLinkStale: false,
      plaidAssetReportToken: null,
      bankInfoMismatch: false,
      goachBankAccountUuid: null,
    },
  });

  // Re-provision GoACH: create a NEW bank account under the same receiver and
  // repoint goachBankAccountUuid so all future/pending debits use it.
  const prov = await ensureGoachBankAccount(applicationId, { force: true });
  if (!prov.ok) {
    return { ok: false, error: `Bank saved, but activating it for payments failed: ${prov.error}. Our team has been notified.` };
  }

  await logAudit({
    action: "CHANGE_BANK",
    entityType: "APPLICATION",
    entityId: applicationId,
    performedBy: "customer (bank-update link)",
    details: { applicationCode: app.applicationCode, goachBankAccountUuid: prov.bankAccountUuid, accountId: input.accountId },
  });

  return { ok: true };
}
