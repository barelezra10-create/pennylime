"use server";

import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";
import { CountryCode } from "plaid";

function classifyCadence(depositCount90d: number): string {
  // 90 days ≈ 13 weeks. Buckets are conservative — pick the heavier signal.
  if (depositCount90d >= 11) return "weekly";
  if (depositCount90d >= 5) return "biweekly";
  if (depositCount90d >= 2) return "monthly";
  return "irregular";
}

function formatAddress(addr?: {
  data?: {
    street?: string | null;
    city?: string | null;
    region?: string | null;
    postal_code?: string | null;
    country?: string | null;
  };
}): string | null {
  const d = addr?.data;
  if (!d) return null;
  const line1 = d.street ?? "";
  const cityState = [d.city, d.region].filter(Boolean).join(", ");
  const tail = [cityState, d.postal_code].filter(Boolean).join(" ");
  return [line1, tail].filter(Boolean).join(", ") || null;
}

export async function fetchAndStoreIncome(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!application?.plaidAccessToken) {
    return { success: false, error: "No Plaid connection" };
  }

  try {
    const accessToken = decrypt(application.plaidAccessToken);

    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const startDate = threeMonthsAgo.toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    // Pull balances, identity, and item info in parallel — these always work
    // when the corresponding Plaid products are enabled. Transactions is
    // pulled separately and gracefully skipped if not approved yet.
    const [balResp, idResp, itemResp] = await Promise.all([
      plaidClient.accountsBalanceGet({ access_token: accessToken }),
      plaidClient.identityGet({ access_token: accessToken }),
      plaidClient.itemGet({ access_token: accessToken }),
    ]);

    // ── Income & cadence ──
    // Prefer Plaid Bank Income (production-enabled): one call returns a
    // verified monthly income + per-source breakdown + pay frequency.
    // Falls back to legacy Transactions logic if Bank Income isn't
    // available (e.g. no user_token, sandbox without income_verification,
    // or the user skipped the income flow in Link).
    let monthlyIncome: number | null = null;
    let avgWeeklyIncome: number | null = null;
    let depositCount90d: number | null = null;
    let largestDeposit: number | null = null;
    let depositCadence: string | null = null;

    if (application.plaidUserToken) {
      try {
        const incomeResp = await plaidClient.creditBankIncomeGet({
          user_token: application.plaidUserToken,
          options: { count: 1 },
        });
        const bankIncome = incomeResp.data.bank_income?.[0];
        const summary = bankIncome?.bank_income_summary;
        const daysRequested = bankIncome?.days_requested ?? 90;
        if (summary?.total_amount && daysRequested > 0) {
          monthlyIncome = (summary.total_amount * 30) / daysRequested;
          avgWeeklyIncome = (summary.total_amount * 7) / daysRequested;
        }
        // Best-effort metrics from the source list (counts + largest).
        const sources = bankIncome?.items?.flatMap((it) => it.bank_income_sources ?? []) ?? [];
        depositCount90d = sources.reduce((n, s) => n + (s.transaction_count ?? 0), 0) || null;
        largestDeposit = sources.reduce((max, s) => Math.max(max, s.total_amount ?? 0), 0) || null;
        // Pick the most common pay frequency among sources as the cadence label.
        const freqCounts = new Map<string, number>();
        for (const s of sources) {
          const f = s.pay_frequency;
          if (f) freqCounts.set(f, (freqCounts.get(f) ?? 0) + 1);
        }
        if (freqCounts.size > 0) {
          depositCadence =
            [...freqCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
              .toLowerCase()
              .replace(/_/g, " ");
        }
      } catch (incErr) {
        console.warn("Bank Income fetch skipped:", incErr);
      }
    }

    // Legacy fallback: Transactions endpoint (used pre-Bank-Income or
    // when income_verification product isn't on this Link session).
    if (monthlyIncome == null) {
      try {
        const txResp = await plaidClient.transactionsGet({
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
        });
        const deposits = txResp.data.transactions.filter((tx) => tx.amount < 0);
        const totalDeposits = deposits.reduce((s, tx) => s + Math.abs(tx.amount), 0);
        monthlyIncome = totalDeposits / 3;
        avgWeeklyIncome = totalDeposits / 13;
        depositCount90d = deposits.length;
        largestDeposit = deposits.reduce(
          (max, tx) => Math.max(max, Math.abs(tx.amount)),
          0
        );
        depositCadence = classifyCadence(depositCount90d);
      } catch (txErr) {
        console.warn("Transactions fallback skipped (product not enabled?):", txErr);
      }
    }

    // ── Account info (resolve the linked account; fall back to first) ──
    const account =
      balResp.data.accounts.find((a) => a.account_id === application.plaidAccountId) ??
      balResp.data.accounts[0];
    const availableBalance = account?.balances?.available ?? null;
    const bankBalance = account?.balances?.current ?? null;
    const plaidAccountName = account?.name ?? null;
    const plaidAccountMask = account?.mask ?? null;
    const plaidAccountSubtype = account?.subtype ?? null;

    // ── Identity (first owner on the account) ──
    const idAccount =
      idResp.data.accounts.find((a) => a.account_id === application.plaidAccountId) ??
      idResp.data.accounts[0];
    const owner = idAccount?.owners?.[0];
    const plaidIdentityName = owner?.names?.[0] ?? null;
    const plaidIdentityAddress = formatAddress(owner?.addresses?.[0]);
    const plaidIdentityEmail = owner?.emails?.[0]?.data ?? null;
    const plaidIdentityPhone = owner?.phone_numbers?.[0]?.data ?? null;

    // ── Institution name (item -> institution lookup) ──
    let plaidInstitutionName: string | null = null;
    const institutionId = itemResp.data.item.institution_id ?? null;
    if (institutionId) {
      try {
        const instResp = await plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        plaidInstitutionName = instResp.data.institution.name ?? null;
      } catch (instErr) {
        console.warn("Plaid institution lookup failed:", instErr);
      }
    }

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        monthlyIncome,
        avgWeeklyIncome,
        depositCount90d,
        largestDeposit,
        depositCadence,
        bankBalance,
        availableBalance,
        plaidAccountName,
        plaidAccountMask,
        plaidAccountSubtype,
        plaidInstitutionName,
        plaidIdentityName,
        plaidIdentityAddress,
        plaidIdentityEmail,
        plaidIdentityPhone,
        lastPlaidRefresh: new Date(),
      },
    });

    return { success: true, monthlyIncome };
  } catch (error) {
    console.error("Plaid income fetch error:", error);
    return { success: false, error: "Could not verify income" };
  }
}

export async function getPlaidIncomeData(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { monthlyIncome: true, plaidAccessToken: true },
  });

  return {
    monthlyIncome: application?.monthlyIncome ? Number(application.monthlyIncome) : null,
    hasPlaidConnection: !!application?.plaidAccessToken,
  };
}

/**
 * Fetch the merchant's account & routing numbers from Plaid Auth and create
 * an Increase ExternalAccount we can later use to push/pull ACH.
 * Returns the Increase external_account_id (cached on the Application).
 */
export async function ensureIncreaseExternalAccount(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { contact: true },
  });
  if (!application?.plaidAccessToken) return { ok: false, error: "no plaid connection" } as const;

  const { createExternalAccount } = await import("@/lib/increase");

  let accessToken: string;
  try {
    accessToken = decrypt(application.plaidAccessToken);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "decrypt failed" } as const;
  }

  let authResp;
  try {
    authResp = await plaidClient.authGet({ access_token: accessToken });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "plaid auth failed" } as const;
  }

  const targetAccount = application.plaidAccountId
    ? authResp.data.numbers.ach.find((n) => n.account_id === application.plaidAccountId)
    : authResp.data.numbers.ach[0];

  if (!targetAccount) return { ok: false, error: "no ACH account on Plaid item" } as const;

  const create = await createExternalAccount({
    routingNumber: targetAccount.routing,
    accountNumber: targetAccount.account,
    description: `${application.firstName} ${application.lastName} (${application.applicationCode})`,
    accountHolder: "individual",
    funding: "checking",
  });

  if (!create.ok) return { ok: false, error: create.error } as const;
  return { ok: true, externalAccountId: create.data.id } as const;
}

/**
 * Fetch the 30 most recent transactions for a given application's linked
 * Plaid account. Used live by the admin application detail page so reviewers
 * can see actual deposit pattern + spending. Not persisted — fresh on each
 * call (Plaid sandbox is free; production charges per call so we can switch
 * to caching later if cost becomes a concern).
 */
export async function getRecentTransactions(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { plaidAccessToken: true, plaidAccountId: true },
  });
  if (!application?.plaidAccessToken) {
    return { ok: false as const, error: "No Plaid connection" };
  }

  let accessToken: string;
  try {
    accessToken = decrypt(application.plaidAccessToken);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "decrypt failed" };
  }

  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const resp = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: threeMonthsAgo.toISOString().split("T")[0],
      end_date: now.toISOString().split("T")[0],
      options: { count: 30, offset: 0 },
    });

    const txs = resp.data.transactions
      .filter(
        (tx) =>
          !application.plaidAccountId || tx.account_id === application.plaidAccountId
      )
      .map((tx) => ({
        id: tx.transaction_id,
        date: tx.date,
        name: tx.name,
        merchantName: tx.merchant_name ?? null,
        amount: tx.amount,
        category: tx.personal_finance_category?.primary ?? tx.category?.[0] ?? null,
        pending: tx.pending,
      }));

    return { ok: true as const, transactions: txs };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Failed to fetch transactions",
    };
  }
}

/**
 * Verify the applicant's identity against the names Plaid Identity returned
 * for the just-linked bank account. Run client-side from the apply funnel
 * after Plaid Link succeeds. Same security model as previewPlaidIncome:
 * the encrypted access token is itself proof of legitimate caller.
 *
 * Returns `match: true` when the form's first+last name appears in (or
 * fully contains) any of the bank's listed account-holder names. A `false`
 * result does NOT block the applicant — it just flags the application for
 * manual admin review on submit.
 */
export async function verifyApplicantIdentity(input: {
  encryptedAccessToken: string;
  firstName: string;
  lastName: string;
}) {
  let accessToken: string;
  try {
    accessToken = decrypt(input.encryptedAccessToken);
  } catch {
    return { ok: false as const, error: "Invalid token" };
  }

  try {
    const idResp = await plaidClient.identityGet({ access_token: accessToken });

    const norm = (s: string) =>
      s.toLowerCase().replace(/[^a-z]/g, "");
    const formFull = norm(`${input.firstName}${input.lastName}`);
    const formFirst = norm(input.firstName);
    const formLast = norm(input.lastName);

    const allNames: string[] = idResp.data.accounts.flatMap((a) =>
      a.owners.flatMap((o) => o.names ?? [])
    );

    let match = false;
    let matchedName: string | null = null;
    for (const n of allNames) {
      const normN = norm(n);
      if (
        normN.includes(formFull) ||
        formFull.includes(normN) ||
        (normN.includes(formFirst) && normN.includes(formLast))
      ) {
        match = true;
        matchedName = n;
        break;
      }
    }

    return {
      ok: true as const,
      match,
      matchedName,
      allNames,
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Identity check failed",
    };
  }
}

/**
 * Preview the verified monthly income and bank balance immediately after
 * a Plaid Link succeeds, before any application row is created. Used to
 * surface "we see $X/mo in deposits" mid-funnel as a trust signal.
 *
 * Public-callable (no auth) — the encrypted access token is itself proof
 * the caller just completed Plaid Link, and decryption only succeeds with
 * the server's encryption key, so no protected data is at risk.
 */
export async function previewPlaidIncome(input: { encryptedAccessToken: string }) {
  let accessToken: string;
  try {
    accessToken = decrypt(input.encryptedAccessToken);
  } catch {
    return { ok: false as const, error: "Invalid token" };
  }

  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    // Balance always available; transactions may not be (production gating).
    const balResp = await plaidClient.accountsBalanceGet({ access_token: accessToken });
    const balance = balResp.data.accounts[0]?.balances?.current ?? null;

    let monthlyIncome = 0;
    try {
      const txResp = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: threeMonthsAgo.toISOString().split("T")[0],
        end_date: now.toISOString().split("T")[0],
      });
      const deposits = txResp.data.transactions
        .filter((tx) => tx.amount < 0)
        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
      monthlyIncome = deposits / 3;
    } catch (txErr) {
      console.warn("previewPlaidIncome: transactions skipped:", txErr);
    }

    return {
      ok: true as const,
      monthlyIncome,
      bankBalance: balance,
    };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Failed to fetch income",
    };
  }
}
