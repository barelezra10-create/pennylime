"use server";

import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";

export type AmbiguousCounterparty = {
  counterpartyName: string;
  txCount: number;
  totalAmount: number;
  sampleTxId: string;
  sampleTxName: string;
  sampleTxDate: string;
  sampleTxAmount: number;
  alreadyClassified: "BUSINESS" | "PERSONAL" | "MIXED" | null;
};

const AMBIGUOUS_PFC_CATEGORIES = new Set([
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "INCOME_OTHER_INCOME",
  "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE",
]);

const MIN_TOTAL_FOR_AMBIGUOUS = 50;

/**
 * Pulls 90 days of Plaid transactions for the linked application, groups
 * deposits by counterparty (merchant_name fallback to name), filters to the
 * ambiguous ones (Plaid couldn't auto-classify with confidence, total ≥ $50,
 * counterparty doesn't already match a known platform), and returns them
 * sorted by total amount descending.
 *
 * Each result includes any prior classification the user already set, so the
 * UI can show progress and skip-to-end on re-entry.
 */
export async function getAmbiguousCounterparties(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { plaidAccessToken: true, plaidAccountId: true, classifications: true },
  });
  if (!app?.plaidAccessToken) {
    return { ok: false as const, error: "No Plaid connection" };
  }

  let accessToken: string;
  try {
    accessToken = decrypt(app.plaidAccessToken);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "decrypt failed" };
  }

  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  let txs;
  try {
    const resp = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: threeMonthsAgo.toISOString().split("T")[0],
      end_date: now.toISOString().split("T")[0],
    });
    txs = resp.data.transactions;
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Failed to fetch transactions",
    };
  }

  // Filter to deposits on the linked account (Plaid: amount < 0 = money in).
  const deposits = txs.filter(
    (tx) =>
      tx.amount < 0 &&
      (!app.plaidAccountId || tx.account_id === app.plaidAccountId),
  );

  // Group by normalized counterparty name.
  type Group = {
    counterpartyName: string;
    transactions: typeof deposits;
    totalAmount: number;
    plaidCategory: string | null;
  };
  const groups: Map<string, Group> = new Map();
  for (const tx of deposits) {
    const raw = tx.merchant_name || tx.name || "Unknown";
    const key = raw.trim().toUpperCase();
    if (!groups.has(key)) {
      groups.set(key, {
        counterpartyName: raw.trim(),
        transactions: [],
        totalAmount: 0,
        plaidCategory: tx.personal_finance_category?.primary ?? null,
      });
    }
    const g = groups.get(key)!;
    g.transactions.push(tx);
    g.totalAmount += Math.abs(tx.amount);
  }

  // Filter to ambiguous: high-volume / -value groups Plaid couldn't classify
  // confidently. Skips small ones (< $50 total) and ones already in a known
  // income category (PAYROLL, INCOME_WAGES) which we trust as business income
  // automatically.
  const existingByName = new Map(
    app.classifications.map((c) => [c.counterpartyName, c.classification as "BUSINESS" | "PERSONAL" | "MIXED"]),
  );

  const ambiguous: AmbiguousCounterparty[] = [];
  for (const g of groups.values()) {
    const cat = g.plaidCategory ?? "";
    const looksAmbiguous =
      AMBIGUOUS_PFC_CATEGORIES.has(cat) ||
      cat === "" ||
      cat.startsWith("TRANSFER");
    if (!looksAmbiguous) continue;
    if (g.totalAmount < MIN_TOTAL_FOR_AMBIGUOUS) continue;

    const sample = g.transactions[0];
    ambiguous.push({
      counterpartyName: g.counterpartyName,
      txCount: g.transactions.length,
      totalAmount: Math.round(g.totalAmount * 100) / 100,
      sampleTxId: sample.transaction_id,
      sampleTxName: sample.merchant_name || sample.name || "Transaction",
      sampleTxDate: sample.date,
      sampleTxAmount: Math.abs(sample.amount),
      alreadyClassified: existingByName.get(g.counterpartyName) ?? null,
    });
  }

  // Largest groups first — biggest impact gets classified earliest.
  ambiguous.sort((a, b) => b.totalAmount - a.totalAmount);

  return { ok: true as const, ambiguous };
}

/**
 * Same as getAmbiguousCounterparties but accepts a pre-encrypted access token
 * directly. Used during the funnel before an Application row exists — the
 * token comes from the Plaid exchange step and is stored in parent React state.
 * No persistence — just returns the ambiguous list client-side so the funnel
 * can collect classifications and submit them with the application.
 */
export async function getAmbiguousCounterpartiesByToken(encryptedAccessToken: string) {
  let accessToken: string;
  try {
    accessToken = decrypt(encryptedAccessToken);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "decrypt failed" };
  }

  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  let txs;
  try {
    const resp = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: threeMonthsAgo.toISOString().split("T")[0],
      end_date: now.toISOString().split("T")[0],
    });
    txs = resp.data.transactions;
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Failed to fetch transactions",
    };
  }

  const deposits = txs.filter((tx) => tx.amount < 0);

  type Group = {
    counterpartyName: string;
    transactions: typeof deposits;
    totalAmount: number;
    plaidCategory: string | null;
  };
  const groups: Map<string, Group> = new Map();
  for (const tx of deposits) {
    const raw = tx.merchant_name || tx.name || "Unknown";
    const key = raw.trim().toUpperCase();
    if (!groups.has(key)) {
      groups.set(key, {
        counterpartyName: raw.trim(),
        transactions: [],
        totalAmount: 0,
        plaidCategory: tx.personal_finance_category?.primary ?? null,
      });
    }
    const g = groups.get(key)!;
    g.transactions.push(tx);
    g.totalAmount += Math.abs(tx.amount);
  }

  const ambiguous: AmbiguousCounterparty[] = [];
  for (const g of groups.values()) {
    const cat = g.plaidCategory ?? "";
    const looksAmbiguous =
      AMBIGUOUS_PFC_CATEGORIES.has(cat) || cat === "" || cat.startsWith("TRANSFER");
    if (!looksAmbiguous) continue;
    if (g.totalAmount < MIN_TOTAL_FOR_AMBIGUOUS) continue;

    const sample = g.transactions[0];
    ambiguous.push({
      counterpartyName: g.counterpartyName,
      txCount: g.transactions.length,
      totalAmount: Math.round(g.totalAmount * 100) / 100,
      sampleTxId: sample.transaction_id,
      sampleTxName: sample.merchant_name || sample.name || "Transaction",
      sampleTxDate: sample.date,
      sampleTxAmount: Math.abs(sample.amount),
      alreadyClassified: null,
    });
  }

  ambiguous.sort((a, b) => b.totalAmount - a.totalAmount);
  return { ok: true as const, ambiguous };
}

/**
 * Bulk-persist all classifications collected during the funnel flow.
 * Called by handleSubmit after the Application row is created.
 */
export async function setTransactionClassificationsBulk(
  applicationId: string,
  classifications: Array<{
    counterpartyName: string;
    classification: "BUSINESS" | "PERSONAL" | "MIXED";
    txCount: number;
    totalAmount: number;
    sampleTxId: string;
    sampleTxDate: string;
    sampleTxAmount: number;
  }>,
) {
  if (!classifications.length) return { ok: true as const };
  await Promise.all(
    classifications.map((c) =>
      prisma.transactionClassification.upsert({
        where: {
          applicationId_counterpartyName: {
            applicationId,
            counterpartyName: c.counterpartyName,
          },
        },
        update: {
          classification: c.classification,
          txCount: c.txCount,
          totalAmount: c.totalAmount,
          sampleTxId: c.sampleTxId,
          sampleTxDate: new Date(c.sampleTxDate),
          sampleTxAmount: c.sampleTxAmount,
          classifiedAt: new Date(),
        },
        create: {
          applicationId,
          counterpartyName: c.counterpartyName,
          classification: c.classification,
          txCount: c.txCount,
          totalAmount: c.totalAmount,
          isInflow: true,
          sampleTxId: c.sampleTxId,
          sampleTxDate: new Date(c.sampleTxDate),
          sampleTxAmount: c.sampleTxAmount,
        },
      }),
    ),
  );
  return { ok: true as const };
}

/**
 * Persist a single counterparty classification. Upserts so the user can
 * change their mind. The funnel UI calls this once per Business/Personal/
 * Mixed click, then loops to the next ambiguous counterparty.
 */
export async function setTransactionClassification(input: {
  applicationId: string;
  counterpartyName: string;
  classification: "BUSINESS" | "PERSONAL" | "MIXED";
  txCount: number;
  totalAmount: number;
  sampleTxId: string;
  sampleTxDate: string;
  sampleTxAmount: number;
}) {
  await prisma.transactionClassification.upsert({
    where: {
      applicationId_counterpartyName: {
        applicationId: input.applicationId,
        counterpartyName: input.counterpartyName,
      },
    },
    update: {
      classification: input.classification,
      txCount: input.txCount,
      totalAmount: input.totalAmount,
      sampleTxId: input.sampleTxId,
      sampleTxDate: new Date(input.sampleTxDate),
      sampleTxAmount: input.sampleTxAmount,
      classifiedAt: new Date(),
    },
    create: {
      applicationId: input.applicationId,
      counterpartyName: input.counterpartyName,
      classification: input.classification,
      txCount: input.txCount,
      totalAmount: input.totalAmount,
      isInflow: true,
      sampleTxId: input.sampleTxId,
      sampleTxDate: new Date(input.sampleTxDate),
      sampleTxAmount: input.sampleTxAmount,
    },
  });
  return { ok: true as const };
}

/**
 * Recalculate refined business income, excluding deposits the user marked as
 * Personal. MIXED counts as 50% business by convention (admin can dial this
 * later if the data shows it's wrong). Stores the result on the Application
 * row for admin visibility and to feed the underwriting model.
 */
export async function recomputeRefinedIncome(applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      plaidAccessToken: true,
      plaidAccountId: true,
      classifications: true,
    },
  });
  if (!app?.plaidAccessToken) {
    return { ok: false as const, error: "No Plaid connection" };
  }

  let accessToken: string;
  try {
    accessToken = decrypt(app.plaidAccessToken);
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "decrypt failed" };
  }

  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const resp = await plaidClient.transactionsGet({
    access_token: accessToken,
    start_date: threeMonthsAgo.toISOString().split("T")[0],
    end_date: now.toISOString().split("T")[0],
  });

  const classByName = new Map(
    app.classifications.map((c) => [c.counterpartyName.toUpperCase(), c.classification]),
  );

  let total = 0;
  for (const tx of resp.data.transactions) {
    if (tx.amount >= 0) continue; // skip withdrawals
    if (app.plaidAccountId && tx.account_id !== app.plaidAccountId) continue;
    const key = (tx.merchant_name || tx.name || "Unknown").trim().toUpperCase();
    const cls = classByName.get(key);
    let weight = 1; // default: count it (likely business income from a known source)
    if (cls === "PERSONAL") weight = 0;
    else if (cls === "MIXED") weight = 0.5;
    total += Math.abs(tx.amount) * weight;
  }

  const refinedMonthly = total / 3;

  await prisma.application.update({
    where: { id: applicationId },
    data: { refinedMonthlyIncome: refinedMonthly },
  });

  return { ok: true as const, refinedMonthlyIncome: refinedMonthly };
}
