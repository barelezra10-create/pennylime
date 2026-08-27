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
