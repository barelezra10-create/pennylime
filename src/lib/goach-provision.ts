import "server-only";
import { prisma } from "@/lib/db";
import { createReceiver, createBankAccount } from "@/lib/goach";

/**
 * Ensure the application has a GoACH receiver + bank account, creating them
 * from the Plaid-verified routing/account on first use. Idempotent: cached
 * uuids on the Application are returned without re-creating.
 *
 * Pass { force: true } to (re)provision even when a bank account already
 * exists — used when a customer changes the bank on file. GoACH bank accounts
 * are immutable, so a change means creating a NEW bank account under the same
 * receiver and repointing goachBankAccountUuid; future/pending debits then hit
 * the new account automatically (they read this uuid live at charge time).
 */
export async function ensureGoachBankAccount(
  applicationId: string,
  opts?: { force?: boolean },
): Promise<
  { ok: true; receiverUuid: string; bankAccountUuid: string } | { ok: false; error: string }
> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      applicationCode: true,
      goachReceiverUuid: true,
      goachBankAccountUuid: true,
    },
  });
  if (!app) return { ok: false, error: "Application not found" };
  if (!opts?.force && app.goachReceiverUuid && app.goachBankAccountUuid) {
    return { ok: true, receiverUuid: app.goachReceiverUuid, bankAccountUuid: app.goachBankAccountUuid };
  }

  const { getPlaidAchNumbers } = await import("@/actions/plaid");
  const auth = await getPlaidAchNumbers(applicationId);
  if (!auth.ok) return { ok: false, error: auth.error };

  let receiverUuid = app.goachReceiverUuid;
  if (!receiverUuid) {
    const r = await createReceiver({
      name: `${app.firstName} ${app.lastName}`.trim(),
      email: app.email,
      custom1: app.applicationCode,
    });
    if (!r.ok) return { ok: false, error: r.error };
    receiverUuid = r.uuid;
    await prisma.application.update({ where: { id: applicationId }, data: { goachReceiverUuid: receiverUuid } });
  }

  const ba = await createBankAccount({
    name: `${app.firstName} ${app.lastName}`.trim().slice(0, 60) || "Borrower",
    receiverUuid,
    routingNumber: auth.routingNumber,
    accountNumber: auth.accountNumber,
    business: false,
    checking: true,
  });
  if (!ba.ok) return { ok: false, error: ba.error };
  await prisma.application.update({ where: { id: applicationId }, data: { goachBankAccountUuid: ba.uuid } });
  return { ok: true, receiverUuid, bankAccountUuid: ba.uuid };
}

// Standard ABA routing-number checksum. Catches typos before we hit GoACH.
export function isValidAbaRouting(routing: string): boolean {
  const d = (routing || "").replace(/\D/g, "");
  if (d.length !== 9) return false;
  const n = d.split("").map(Number);
  const sum =
    3 * (n[0] + n[3] + n[6]) +
    7 * (n[1] + n[4] + n[7]) +
    1 * (n[2] + n[5] + n[8]);
  return sum % 10 === 0;
}

/**
 * Provision a GoACH bank account from MANUALLY-entered routing/account numbers
 * (e.g. a borrower who moved to a Lyft Direct / Stride account we can't reach
 * via Plaid). Creates the receiver if needed, creates a NEW bank account, and
 * repoints goachBankAccountUuid so all future debits use it.
 */
export async function provisionGoachBankManual(
  applicationId: string,
  input: { routingNumber: string; accountNumber: string; bankName?: string; checking?: boolean },
): Promise<{ ok: true; receiverUuid: string; bankAccountUuid: string } | { ok: false; error: string }> {
  const routing = (input.routingNumber || "").replace(/\D/g, "");
  const account = (input.accountNumber || "").replace(/\D/g, "");
  if (routing.length !== 9) return { ok: false, error: "Routing number must be 9 digits." };
  if (!isValidAbaRouting(routing)) return { ok: false, error: "Routing number failed the ABA checksum (typo?)." };
  if (account.length < 4 || account.length > 17) return { ok: false, error: "Account number length looks wrong." };

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, firstName: true, lastName: true, email: true, applicationCode: true, goachReceiverUuid: true },
  });
  if (!app) return { ok: false, error: "Application not found" };

  let receiverUuid = app.goachReceiverUuid;
  if (!receiverUuid) {
    const r = await createReceiver({ name: `${app.firstName} ${app.lastName}`.trim(), email: app.email, custom1: app.applicationCode });
    if (!r.ok) return { ok: false, error: r.error };
    receiverUuid = r.uuid;
    await prisma.application.update({ where: { id: applicationId }, data: { goachReceiverUuid: receiverUuid } });
  }

  // Null the old pointer first so a failure can't keep debiting the old bank.
  await prisma.application.update({ where: { id: applicationId }, data: { goachBankAccountUuid: null } });

  const ba = await createBankAccount({
    name: `${app.firstName} ${app.lastName}`.trim().slice(0, 60) || "Borrower",
    receiverUuid,
    routingNumber: routing,
    accountNumber: account,
    business: false,
    checking: input.checking !== false,
  });
  if (!ba.ok) return { ok: false, error: ba.error };

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      goachBankAccountUuid: ba.uuid,
      bankName: input.bankName || null,
      bankRoutingNumberManual: routing,
      bankAccountNumberManual: account,
    },
  });
  return { ok: true, receiverUuid, bankAccountUuid: ba.uuid };
}
