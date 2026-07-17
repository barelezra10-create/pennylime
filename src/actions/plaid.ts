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
        const stored = application.plaidUserToken;
        // Same usr_-prefix heuristic as the link-token route. Accounts post
        // Dec 10, 2025 use user_id (usr_...); older accounts use user_token.
        const userIdField = stored.startsWith("usr_") ? { user_id: stored } : { user_token: stored };
        const incomeResp = await plaidClient.creditBankIncomeGet({
          ...userIdField,
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
    // Distinguish decryption failures (token corrupted in storage) from
    // Plaid API failures (token expired / item removed). Both manifest as
    // "no income data" but the admin needs different remediation: re-link
    // bank for decrypt errors, contact Plaid for API errors.
    const msg = error instanceof Error ? error.message : String(error);
    const isDecryptFailure = /decrypt|invalid token|cannot read/i.test(msg);
    console.error(
      `[plaid income] ${isDecryptFailure ? "DECRYPT" : "API"} failure for app ${applicationId}:`,
      msg,
    );
    await prisma.application.update({
      where: { id: applicationId },
      data: { lastPlaidRefresh: new Date() },
    }).catch(() => null);
    return {
      success: false,
      error: isDecryptFailure
        ? "Stored bank token is corrupted — borrower needs to re-link their bank."
        : "Could not verify income",
    };
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
 * Extract the ACH routing and account numbers for an application from Plaid Auth.
 * Shared by ensureIncreaseExternalAccount and ensureGoachBankAccount so the
 * decrypt + authGet logic is not duplicated.
 */
export async function getPlaidAchNumbers(applicationId: string): Promise<
  { ok: true; routingNumber: string; accountNumber: string } | { ok: false; error: string }
> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { plaidAccessToken: true, plaidAccountId: true },
  });
  if (!application?.plaidAccessToken) return { ok: false, error: "no plaid connection" };
  let accessToken: string;
  try { accessToken = decrypt(application.plaidAccessToken); }
  catch (err) { return { ok: false, error: err instanceof Error ? err.message : "decrypt failed" }; }
  let authResp;
  try { authResp = await plaidClient.authGet({ access_token: accessToken }); }
  catch (err) { return { ok: false, error: err instanceof Error ? err.message : "plaid auth failed" }; }
  const targetAccount = application.plaidAccountId
    ? authResp.data.numbers.ach.find((n) => n.account_id === application.plaidAccountId)
    : authResp.data.numbers.ach[0];
  if (!targetAccount) return { ok: false, error: "no ACH account on Plaid item" };
  return { ok: true, routingNumber: targetAccount.routing, accountNumber: targetAccount.account };
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

  const auth = await getPlaidAchNumbers(applicationId);
  if (!auth.ok) return { ok: false, error: auth.error } as const;

  const create = await createExternalAccount({
    routingNumber: auth.routingNumber,
    accountNumber: auth.accountNumber,
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

/* ───────────────────────────────────────────────────────────────
   PLAID ASSETS — automated underwriting income fetch.

   Two-step async flow:
   1. createAssetReport: POST /asset_report/create with the access
      token. Plaid returns an asset_report_token. We persist it on
      the Application row. Plaid then builds the report (10-60s).
   2. fetchAssetReport: POST /asset_report/get with that token.
      Returns the structured transactions/balances/identity payload.
      Called from the Plaid webhook handler when ASSETS:PRODUCT_READY
      fires, OR by a manual admin trigger as a fallback.

   Same downstream effect as Plaid Transactions / Bank Income:
   populates Application.monthlyIncome, avgWeeklyIncome,
   depositCount90d, largestDeposit, depositCadence, preferredChargeDay.
   ─────────────────────────────────────────────────────────────── */

/**
 * Admin-triggered "Pull Plaid Asset Report" — composes
 * createAssetReport + fetchAssetReportAndStoreIncome into a single
 * action with retry behaviour for the typical case where the
 * webhook is slow or never fires:
 *
 *   1. If no report token exists, create one.
 *   2. Try fetch immediately. If Plaid says "not ready yet"
 *      (PRODUCT_NOT_READY), poll up to ~60s for the report to
 *      finish, then fetch.
 *   3. Return the resulting income summary or a clear error.
 */
export async function triggerPlaidAssetReport(applicationId: string) {
  // Step 1: ensure a report exists.
  const created = await createAssetReport(applicationId);
  if (!created.success) {
    return { success: false as const, error: created.error };
  }
  // Step 2: poll for readiness (up to ~60s).
  const start = Date.now();
  const TIMEOUT_MS = 90_000;
  const POLL_MS = 4_000;
  let lastErr: string | null = null;
  while (Date.now() - start < TIMEOUT_MS) {
    const fetched = await fetchAssetReportAndStoreIncome(applicationId);
    if (fetched.success) {
      return {
        success: true as const,
        message: created.alreadyCreated
          ? "Pulled existing Plaid asset report."
          : "Plaid asset report generated and pulled.",
      };
    }
    lastErr = fetched.error ?? null;
    // Plaid returns PRODUCT_NOT_READY while the report is still being
    // built — any other error is terminal and we bail.
    if (!lastErr || !/not[_ ]ready/i.test(lastErr)) {
      return { success: false as const, error: lastErr ?? "asset report fetch failed" };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return {
    success: false as const,
    error: `Asset report not ready after ${Math.round(TIMEOUT_MS / 1000)}s. Try the button again in a minute — Plaid sometimes needs longer.`,
  };
}

/**
 * Downloads the Plaid Asset Report as a PDF and pushes it through
 * the same Gemini parser that bank-statement uploads use. Plaid's
 * built-in assetReportGet analytics already populate the headline
 * fields (monthlyIncome, depositCount90d, etc.), but the AI parser
 * gives us richer outputs:
 *   - deposit-level classification (income vs transfer vs refund)
 *   - the account holder's legal name from the statement header
 *   - a "confidence" signal we can show in the AI Risk Analysis
 *
 * Stores the PDF as a Document (documentType = PLAID_ASSET_REPORT_PDF)
 * so admins can review the actual source doc later. Writes the same
 * income fields the bank-statement parser writes — so downstream
 * (rules engine, AI risk, offer page) doesn't care whether the data
 * came from Plaid built-in, Plaid PDF + AI, or manual statement upload.
 */
export async function parsePlaidAssetReportWithAI(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, plaidAssetReportToken: true },
  });
  if (!application?.plaidAssetReportToken) {
    return { success: false as const, error: "No asset report yet — click Pull Asset Report first." };
  }

  // 1. Fetch the PDF from Plaid.
  let pdfBuffer: Buffer;
  try {
    const response = await plaidClient.assetReportPdfGet(
      { asset_report_token: application.plaidAssetReportToken },
      { responseType: "arraybuffer" },
    );
    pdfBuffer = Buffer.from(response.data as ArrayBuffer);
    if (pdfBuffer.length === 0) {
      return { success: false as const, error: "Plaid returned an empty PDF." };
    }
  } catch (err) {
    console.error("assetReportPdfGet failed:", err);
    const message = err instanceof Error ? err.message : "Plaid PDF fetch failed";
    return { success: false as const, error: message };
  }

  // 2. Save the PDF as a Document for admin review.
  let savedDocId: string | null = null;
  try {
    const { storage } = await import("@/lib/storage");
    const filename = `plaid-asset-report-${applicationId.slice(0, 8)}-${Date.now()}.pdf`;
    const storagePath = await storage.upload(pdfBuffer, filename);
    const doc = await prisma.document.create({
      data: {
        applicationId,
        fileName: filename,
        mimeType: "application/pdf",
        fileSize: pdfBuffer.length,
        storagePath,
        documentType: "PLAID_ASSET_REPORT_PDF",
      },
    });
    savedDocId = doc.id;
  } catch (err) {
    console.error("Failed to save asset report PDF as Document:", err);
    // Non-blocking — continue with the parse even if storage failed.
  }

  // 3. Parse with the same Gemini pipeline bank statements use.
  const { parseStatementsWithAI } = await import("@/lib/bank-statement-parser");
  let parsed;
  try {
    parsed = await parseStatementsWithAI([
      { filename: "plaid-asset-report.pdf", buffer: pdfBuffer, mimeType: "application/pdf" },
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI parse failed";
    console.error("AI parse of asset report failed:", message);
    return { success: false as const, error: message };
  }

  // 4. Pick the best weekly debit day from the deposit pattern.
  const { computeBestChargeDay } = await import("@/lib/payment-day");
  const bestDay = computeBestChargeDay(parsed.deposits ?? []);

  // 5. Write into the same fields Plaid built-in and the bank-statement
  // parser write — keep downstream code source-agnostic.
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      monthlyIncome: parsed.monthlyIncome,
      totalIncome: parsed.monthlyIncome * 3,
      avgWeeklyIncome: parsed.avgWeeklyIncome,
      depositCount90d: parsed.depositCount,
      largestDeposit: parsed.largestDeposit,
      depositCadence: parsed.estimatedCadence === "irregular" ? "irregular" : parsed.estimatedCadence,
      plaidIdentityName: parsed.accountHolderName ?? undefined,
      plaidInstitutionName: parsed.bankName ?? undefined,
      preferredChargeDay: bestDay?.dayOfWeek ?? null,
      lastPlaidRefresh: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "AI_PARSE_PLAID_ASSET_REPORT",
      entityType: "APPLICATION",
      entityId: applicationId,
      performedBy: "system:admin",
      details: JSON.stringify({
        savedDocId,
        monthlyIncome: parsed.monthlyIncome,
        depositCount: parsed.depositCount,
        confidence: parsed.confidence,
        accountHolderName: parsed.accountHolderName,
        bankName: parsed.bankName,
      }),
    },
  });

  return {
    success: true as const,
    monthlyIncome: parsed.monthlyIncome,
    avgWeeklyIncome: parsed.avgWeeklyIncome,
    depositCount: parsed.depositCount,
    largestDeposit: parsed.largestDeposit,
    cadence: parsed.estimatedCadence,
    accountHolderName: parsed.accountHolderName,
    bankName: parsed.bankName,
    confidence: parsed.confidence,
  };
}

export async function createAssetReport(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, plaidAccessToken: true, plaidAssetReportToken: true },
  });
  if (!application?.plaidAccessToken) {
    return { success: false as const, error: "No Plaid connection" };
  }
  // Don't double-create — if we already have a token in flight, just
  // re-trigger the get path (webhook may have fired earlier).
  if (application.plaidAssetReportToken) {
    return { success: true as const, alreadyCreated: true, token: application.plaidAssetReportToken };
  }
  try {
    const accessToken = decrypt(application.plaidAccessToken);
    const response = await plaidClient.assetReportCreate({
      access_tokens: [accessToken],
      days_requested: 90,
      options: {
        client_report_id: applicationId,
        // Optional but useful for audit reports — admin's name as report owner.
        webhook: process.env.PLAID_WEBHOOK_URL,
      },
    });
    const token = response.data.asset_report_token;
    await prisma.application.update({
      where: { id: applicationId },
      data: { plaidAssetReportToken: token },
    });
    return { success: true as const, token, alreadyCreated: false };
  } catch (err) {
    console.error("createAssetReport error:", err);
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "asset report create failed",
    };
  }
}

/**
 * Fetches the asset report from Plaid and writes the parsed income
 * data onto the Application row. Idempotent — safe to call multiple
 * times (webhook + manual admin retry).
 */
export async function fetchAssetReportAndStoreIncome(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, plaidAssetReportToken: true, plaidAccountId: true },
  });
  if (!application?.plaidAssetReportToken) {
    return { success: false as const, error: "No asset report token — call createAssetReport first" };
  }
  try {
    const response = await plaidClient.assetReportGet({
      asset_report_token: application.plaidAssetReportToken,
      include_insights: true,
    });
    const report = response.data.report;
    const item = report.items?.[0];
    if (!item) return { success: false as const, error: "Asset report has no items" };

    // Pick the linked account (or first one).
    const account =
      item.accounts.find((a) => a.account_id === application.plaidAccountId) ??
      item.accounts[0];
    if (!account) return { success: false as const, error: "Asset report has no accounts" };

    const txns = account.transactions ?? [];

    // Plaid convention: negative amount = deposit (money in).
    const deposits = txns.filter((t) => Number(t.amount) < 0);
    const totalDeposits = deposits.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const monthlyIncome = totalDeposits / 3;
    const avgWeeklyIncome = totalDeposits / 13;
    const depositCount90d = deposits.length;
    const largestDeposit = deposits.reduce(
      (max, t) => Math.max(max, Math.abs(Number(t.amount))),
      0,
    );
    const depositCadence = classifyCadence(depositCount90d);

    // Best charge day, same algorithm as the manual AI parser.
    const { computeBestChargeDay } = await import("@/lib/payment-day");
    const bestDay = computeBestChargeDay(
      deposits.map((t) => ({
        date: typeof t.date === "string" ? t.date : new Date(t.date as unknown as string).toISOString().slice(0, 10),
        amount: Number(t.amount),
        classification: "income",
      })),
    );

    const owner = account.owners?.[0];
    const plaidIdentityName = owner?.names?.[0] ?? null;
    const balances = account.balances;

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        monthlyIncome,
        totalIncome: monthlyIncome * 3,
        avgWeeklyIncome,
        depositCount90d,
        largestDeposit,
        depositCadence,
        bankBalance: balances?.current ?? null,
        availableBalance: balances?.available ?? null,
        plaidAccountName: account.name ?? null,
        plaidAccountMask: account.mask ?? null,
        plaidIdentityName: plaidIdentityName ?? undefined,
        preferredChargeDay: bestDay?.dayOfWeek ?? null,
        lastPlaidRefresh: new Date(),
      },
    });

    return {
      success: true as const,
      monthlyIncome,
      depositCount90d,
      cadence: depositCadence,
      preferredChargeDay: bestDay,
    };
  } catch (err) {
    console.error("fetchAssetReportAndStoreIncome error:", err);
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "asset report fetch failed",
    };
  }
}
