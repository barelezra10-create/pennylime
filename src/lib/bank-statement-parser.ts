/**
 * Bank-statement parser. Sends one or more PDF bank statements to
 * Gemini (which natively supports PDF input) and asks it to extract
 * the deposits + derive a verified monthly income figure.
 *
 * Returns the same shape we'd otherwise populate from Plaid Bank
 * Income / Transactions, so the downstream rules engine and admin UI
 * don't care whether the data came from Plaid or from manual upload.
 */

import { GoogleGenAI } from "@google/genai";

// We try the stronger gemini-2.5-flash first (much better at income/expense
// direction — e.g. not filing a check deposit as an expense) and fall back to
// gemini-2.5-flash-lite if the key can't access it (older keys 403/404 on
// flash). Override either with GEMINI_PARSE_MODEL / GEMINI_PARSE_FALLBACK_MODEL.
const PRIMARY_MODEL = process.env.GEMINI_PARSE_MODEL || "gemini-2.5-flash";
const FALLBACK_MODEL = process.env.GEMINI_PARSE_FALLBACK_MODEL || "gemini-2.5-flash-lite";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  client = new GoogleGenAI({ apiKey });
  return client;
}

export type ParsedDeposit = {
  date: string; // ISO yyyy-mm-dd
  amount: number;
  description: string;
  classification?: "income" | "transfer" | "refund" | "unknown";
  platform?: string; // gig platform / income source, e.g. "Uber", "DoorDash", "Other"
};

export type ParsedExpense = {
  date: string; // ISO yyyy-mm-dd
  amount: number; // positive dollars out
  description: string;
  category?: string; // one of the fixed expense categories (see monthly-pl.ts)
};

export type ParsedStatementSummary = {
  accountHolderName: string | null;
  bankName: string | null;
  statementPeriodStart: string | null; // ISO yyyy-mm-dd
  statementPeriodEnd: string | null; // ISO yyyy-mm-dd
  deposits: ParsedDeposit[];
  expenses: ParsedExpense[];
  monthlyIncome: number;
  avgWeeklyIncome: number;
  depositCount: number;
  largestDeposit: number;
  // Underwriting risk signals — how often this account bounces / runs dry.
  nsfCount: number; // NSF / overdraft / returned-item fees across the period
  daysNegative: number; // days the running balance was negative (best effort)
  minBalance: number | null; // lowest balance seen (null if not shown)
  estimatedCadence: "weekly" | "biweekly" | "semi-monthly" | "monthly" | "irregular" | "unknown";
  confidence: "high" | "medium" | "low";
  notes: string | null;
};

const SYSTEM_PROMPT = `You are an underwriting analyst at PennyLime, a cash-advance product for gig workers. You will be given one or more PDF bank statements. Your job is to extract a structured income summary.

Rules:
- CRITICAL: a "deposit" is ONLY a CREDIT that INCREASES the balance (money flowing INTO the account). A card purchase, debit, or withdrawal at a merchant is money OUT and must NEVER appear in "deposits", even if it looks similar. Restaurants (e.g. Jack in the Box, McDonald's), stores (Walmart, Target), gas stations (Shell, Chevron), and pharmacies (CVS, Walgreens) are places people SPEND money, never income sources. Never list them as income.
- Do NOT repeat the same transaction more than once. Each line on the statement is one entry. Never emit hundreds of identical rows.
- Only count INCOME deposits (gig-platform payouts: Uber, Lyft, DoorDash, Instacart, Amazon Flex, Grubhub, freelance/contract income, payroll). Skip transfers between accounts, refunds, ATM credits, ACH credits FROM the customer themselves.
- Lines labeled "Trip Earnings", "Trip Fare", "Instant Pay", "Weekly Payout", "Driver/Courier Pay", or "Earnings" are gig INCOME (money IN) and belong in "deposits", NEVER in "expenses".
- Compute monthlyIncome as the average monthly income across the entire period covered (sum of income deposits ÷ number of months covered).
- Compute avgWeeklyIncome = sum of income deposits ÷ number of weeks covered.
- Estimate the pay cadence based on the deposit pattern.
- If multiple statements are provided, treat them as one continuous period.
- If the statements don't cover at least 30 days, set confidence to "low" and explain in notes.
- Return ALL deposits you identified as income, sorted oldest first.
- For EVERY income deposit, set "platform" to the NAME OF THE PAYER / source that sent the money, exactly as a person would recognize it from the statement line. Read the transaction description / originator name and extract the real sender: e.g. "ACH DEPOSIT UBER TECHNOLOGIES 800-..." -> "Uber", "DOORDASH INC DES:..." -> "DoorDash", "INSTACART / MAPLEBEAR" -> "Instacart", "STRIPE TRANSFER" -> "Stripe", "PAYROLL ACME LLC" -> "Acme LLC", "ZELLE FROM JOHN SMITH" -> "John Smith". Also use the statement's account type as a strong clue (an "Uber Pro Card" statement means the deposits are Uber; a "DasherDirect" card means DoorDash). CONSOLIDATE variants of the same payer into ONE clean name (e.g. "UBER EATS", "UBER BV 8005928996" both -> "Uber"). NEVER return "Other", "Unknown", "Deposit", "Credit", or any generic label - always give the real payer/source name pulled from the statement. This is used to show the applicant's TOP EARNING SOURCES, so accuracy of the name matters.

Expenses (money OUT):
- Also extract EVERY withdrawal / debit / money-out transaction into "expenses" with a POSITIVE dollar amount: card purchases, ACH debits, bill payments, loan/advance payments, subscriptions, transfers out (Zelle/Venmo/CashApp out), and ATM/cash withdrawals.
- Tag each expense with "category", which MUST be EXACTLY one of this fixed list: "Fuel / Gas", "Vehicle & Transport", "Groceries", "Food & Dining", "Housing / Rent", "Utilities & Phone", "Insurance", "Loan & Debt Payments", "Subscriptions", "Shopping / Retail", "Transfers", "ATM / Cash", "Other". Use the merchant/description to choose (e.g. "SHELL OIL" -> "Fuel / Gas", "GEICO" -> "Insurance", "AFFIRM PAYMENT" or "CASH ADVANCE" -> "Loan & Debt Payments", "NETFLIX" -> "Subscriptions", "WALMART" -> "Groceries", "ZELLE TO ..." -> "Transfers", "ATM WITHDRAWAL" -> "ATM / Cash"). Only use "Other" when nothing else fits.
- "expenses" must contain ONLY money that LEFT the account (debits / withdrawals / purchases). NEVER put a deposit, credit, refund received, earnings, payout, or direct/mobile deposit in "expenses" — those are money IN and belong in "deposits". This INCLUDES check deposits: a "CHECK DEPOSIT", "TELLER DEPOSIT", "CASH DEPOSIT", "ATM DEPOSIT", "MOBILE/REMOTE DEPOSIT", or "INCOMING ACH/WIRE" is money IN and belongs in "deposits", NEVER in "expenses". (A bare "CHECK #1234" with no "deposit" wording is usually a check the customer WROTE — that is money OUT, an expense.) Do NOT put money-out in "deposits". Return expenses sorted oldest first.

Risk signals (how often this account bounces or runs dry — critical for lending):
- "nsfCount": count EVERY fee line indicating a bounce or negative balance across all statements: "NSF FEE", "NON-SUFFICIENT FUNDS", "OVERDRAFT FEE", "OD FEE", "RETURNED ITEM FEE", "INSUFFICIENT FUNDS FEE", "UNCOLLECTED FUNDS". Count each occurrence. 0 if none.
- "daysNegative": your best estimate of how many days the running/available balance was BELOW $0 across the period (from the balance column if shown). 0 if the balance never went negative or you can't tell.
- "minBalance": the LOWEST running/available balance shown anywhere in the statements (may be negative). null if the statement doesn't show a running balance.

Return ONLY valid JSON matching the schema below. No prose, no markdown fences.`;

const RESPONSE_SCHEMA = `{
  "accountHolderName": string | null,
  "bankName": string | null,
  "statementPeriodStart": "YYYY-MM-DD" | null,
  "statementPeriodEnd": "YYYY-MM-DD" | null,
  "deposits": [
    {
      "date": "YYYY-MM-DD",
      "amount": number,
      "description": string,
      "classification": "income" | "transfer" | "refund" | "unknown",
      "platform": string
    }
  ],
  "expenses": [
    {
      "date": "YYYY-MM-DD",
      "amount": number,
      "description": string,
      "category": "Fuel / Gas" | "Vehicle & Transport" | "Groceries" | "Food & Dining" | "Housing / Rent" | "Utilities & Phone" | "Insurance" | "Loan & Debt Payments" | "Subscriptions" | "Shopping / Retail" | "Transfers" | "ATM / Cash" | "Other"
    }
  ],
  "monthlyIncome": number,
  "avgWeeklyIncome": number,
  "depositCount": number,
  "largestDeposit": number,
  "nsfCount": number,
  "daysNegative": number,
  "minBalance": number | null,
  "estimatedCadence": "weekly" | "biweekly" | "semi-monthly" | "monthly" | "irregular" | "unknown",
  "confidence": "high" | "medium" | "low",
  "notes": string | null
}`;

// Walk a (possibly truncated) JSON response and pull out every COMPLETE
// object inside the named array (e.g. "deposits" or "expenses"). Used to
// recover data when Gemini hits its output-token limit mid-array and returns
// invalid JSON.
function salvageArray<T>(text: string, arrayKey: string): T[] {
  const key = text.indexOf(`"${arrayKey}"`);
  if (key === -1) return [];
  const arrStart = text.indexOf("[", key);
  if (arrStart === -1) return [];

  const out: T[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;

  for (let i = arrStart + 1; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          const obj = JSON.parse(text.slice(objStart, i + 1)) as T & { amount?: unknown };
          if (obj && typeof obj.amount !== "undefined") out.push(obj);
        } catch {
          /* skip a malformed object */
        }
        objStart = -1;
      }
    } else if (c === "]" && depth === 0) {
      break; // end of this array
    }
  }
  return out;
}

// Pull a top-level string field out of a raw (possibly truncated) response.
function extractTopLevelString(text: string, field: string): string | null {
  const m = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
  return m ? m[1] : null;
}

// Recompute the numeric income fields from a set of deposits. Shared by the
// truncation-salvage path and the multi-statement merge path.
function computeIncomeFields(deposits: ParsedDeposit[]): {
  monthlyIncome: number;
  avgWeeklyIncome: number;
  depositCount: number;
  largestDeposit: number;
  periodStart: string | null;
  periodEnd: string | null;
} {
  const income = deposits.filter(
    (d) => (d.classification ?? "income") === "income" && Number(d.amount) > 0,
  );
  const total = income.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const dates = income.map((d) => d.date).filter(Boolean).sort();
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  const monthsCount = Math.max(1, months.size);
  const first = dates[0] ? new Date(dates[0]) : null;
  const last = dates[dates.length - 1] ? new Date(dates[dates.length - 1]) : null;
  const weeks =
    first && last ? Math.max(1, (last.getTime() - first.getTime()) / (7 * 86400000)) : monthsCount * 4.345;

  return {
    monthlyIncome: total / monthsCount,
    avgWeeklyIncome: total / weeks,
    depositCount: income.length,
    largestDeposit: income.reduce((m, d) => Math.max(m, Number(d.amount) || 0), 0),
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
  };
}

// Recompute the income summary from salvaged deposits when the AI truncated.
function buildSummaryFromDeposits(
  text: string,
  deposits: ParsedDeposit[],
  expenses: ParsedExpense[],
): ParsedStatementSummary {
  const f = computeIncomeFields(deposits);
  return {
    accountHolderName: extractTopLevelString(text, "accountHolderName"),
    bankName: extractTopLevelString(text, "bankName"),
    statementPeriodStart: f.periodStart,
    statementPeriodEnd: f.periodEnd,
    deposits,
    expenses,
    monthlyIncome: f.monthlyIncome,
    avgWeeklyIncome: f.avgWeeklyIncome,
    depositCount: f.depositCount,
    largestDeposit: f.largestDeposit,
    // Risk signals can't be recovered from a truncated response — leave neutral.
    nsfCount: 0,
    daysNegative: 0,
    minBalance: null,
    estimatedCadence: "unknown",
    confidence: "low",
    notes: "Recovered from a truncated AI response; summary recomputed from the deposits that parsed.",
  };
}

// Merge several per-statement summaries into one, recomputing the aggregate
// income figures across the full deposit set.
function mergeSummaries(summaries: ParsedStatementSummary[]): ParsedStatementSummary {
  const deposits = summaries.flatMap((s) => s.deposits);
  const expenses = summaries.flatMap((s) => s.expenses ?? []);
  const f = computeIncomeFields(deposits);
  const truncated = summaries.some((s) => s.confidence === "low" && (s.notes ?? "").includes("truncated"));
  // Risk signals across statements: sum the bounce counts, keep the worst
  // (lowest) balance seen.
  const nsfCount = summaries.reduce((s, x) => s + (Number(x.nsfCount) || 0), 0);
  const daysNegative = summaries.reduce((s, x) => s + (Number(x.daysNegative) || 0), 0);
  const minBalances = summaries.map((x) => x.minBalance).filter((v): v is number => v != null);
  const minBalance = minBalances.length ? Math.min(...minBalances) : null;
  return {
    accountHolderName: summaries.find((s) => s.accountHolderName)?.accountHolderName ?? null,
    bankName: summaries.find((s) => s.bankName)?.bankName ?? null,
    statementPeriodStart: f.periodStart,
    statementPeriodEnd: f.periodEnd,
    deposits,
    expenses,
    monthlyIncome: f.monthlyIncome,
    avgWeeklyIncome: f.avgWeeklyIncome,
    depositCount: f.depositCount,
    largestDeposit: f.largestDeposit,
    nsfCount,
    daysNegative,
    minBalance,
    estimatedCadence: summaries.find((s) => s.estimatedCadence !== "unknown")?.estimatedCadence ?? "unknown",
    confidence: truncated ? "low" : summaries[0]?.confidence ?? "medium",
    notes: truncated ? "One or more statements were very deposit-heavy; some deposits may be omitted." : null,
  };
}

// Parse a single Gemini call over one or more PDFs and normalize the result.
async function parseOneBatch(
  ai: GoogleGenAI,
  pdfs: Array<{ filename: string; buffer: Buffer; mimeType: string }>,
): Promise<ParsedStatementSummary> {
  const parts: Array<
    | { inlineData: { mimeType: string; data: string } }
    | { text: string }
  > = [];
  for (const pdf of pdfs) {
    parts.push({
      inlineData: {
        mimeType: pdf.mimeType,
        data: pdf.buffer.toString("base64"),
      },
    });
  }
  parts.push({
    text: `Extract the income summary from the ${pdfs.length === 1 ? "statement" : `${pdfs.length} statements`} above. Return JSON matching this schema:\n\n${RESPONSE_SCHEMA}`,
  });

  const config = {
    systemInstruction: SYSTEM_PROMPT,
    temperature: 0,
    responseMimeType: "application/json",
    // Statements with many small daily gig payouts produce a long deposit
    // array. Give the model plenty of room so the JSON isn't cut off
    // mid-array (which yields "Unterminated string" parse errors).
    maxOutputTokens: 65536,
  };
  let result;
  try {
    result = await ai.models.generateContent({ model: PRIMARY_MODEL, contents: [{ role: "user", parts }], config });
  } catch (err) {
    // Older keys 403/404 on flash — fall back to the always-available lite tier.
    console.warn(`[parseStatementsWithAI] ${PRIMARY_MODEL} failed (${err instanceof Error ? err.message : err}); falling back to ${FALLBACK_MODEL}`);
    result = await ai.models.generateContent({ model: FALLBACK_MODEL, contents: [{ role: "user", parts }], config });
  }

  const text = result.text;
  if (!text) throw new Error("Empty response from Gemini");

  let parsed: ParsedStatementSummary;
  try {
    parsed = JSON.parse(text) as ParsedStatementSummary;
  } catch {
    // The response was truncated (model hit the output-token ceiling), so
    // the JSON is incomplete. Salvage every complete deposit + expense object
    // we can and recompute the summary rather than losing everything.
    const deposits = salvageArray<ParsedDeposit>(text, "deposits");
    const expenses = salvageArray<ParsedExpense>(text, "expenses");
    if (deposits.length === 0 && expenses.length === 0) {
      throw new Error("Failed to parse Gemini response as JSON and nothing could be salvaged");
    }
    parsed = buildSummaryFromDeposits(text, deposits, expenses);
  }

  // Defensive normalization — Gemini might return strings, missing fields, etc.
  parsed.monthlyIncome = Number(parsed.monthlyIncome) || 0;
  parsed.avgWeeklyIncome = Number(parsed.avgWeeklyIncome) || 0;
  parsed.depositCount = Number(parsed.depositCount) || 0;
  parsed.largestDeposit = Number(parsed.largestDeposit) || 0;
  parsed.deposits = Array.isArray(parsed.deposits) ? parsed.deposits : [];
  parsed.expenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];
  parsed.nsfCount = Number(parsed.nsfCount) || 0;
  parsed.daysNegative = Number(parsed.daysNegative) || 0;
  parsed.minBalance = parsed.minBalance == null ? null : Number(parsed.minBalance);

  return parsed;
}

// Merchants no one earns INCOME from. The AI sometimes miscounts card purchases
// (money OUT) as income deposits (seen: "JACK IN THE BOX" showing as 688 income
// "deposits" of ~$3.58, inflating income). A deposit whose payer matches one of
// these is a purchase, so it is NOT counted toward income.
const SPENDING_MERCHANTS = [
  "jack in the box", "mcdonald", "burger king", "wendy", "taco bell", "chick-fil",
  "chipotle", "subway", "popeyes", "kfc", "domino", "pizza hut", "starbucks",
  "dunkin", "panera", "in-n-out", "raising cane", "whataburger", "sonic drive",
  "arby", "dairy queen", "little caesars", "five guys", "jersey mike", "wingstop",
  "walmart", "costco", "dollar general", "dollar tree", "family dollar",
  "best buy", "home depot", "walgreens", "cvs", "rite aid", "shell", "chevron",
  "exxon", "circle k", "7-eleven", "speedway", "quiktrip", "racetrac", "valero",
];
// Legit income that can be delivered via / near a merchant name (earned-wage-access
// like DailyPay for a Target/Walmart worker, or a check deposited by phone). If the
// line looks like income delivery, keep it even if a merchant word appears.
const INCOME_DELIVERY = [
  "dailypay", "payroll", "direct dep", "mobile deposit", "deposit@mobile",
  "earnin", "moneylion", "tapcheck", "earned wage", "branch messenger",
];
function isSpendingMerchant(d: ParsedDeposit): boolean {
  const s = `${d.description || ""} ${d.platform || ""}`.toLowerCase();
  if (INCOME_DELIVERY.some((k) => s.includes(k))) return false;
  return SPENDING_MERCHANTS.some((k) => s.includes(k));
}

// Cap identical (date, amount, description) rows. The Gemini parser occasionally
// gets stuck repeating a single line (seen: 1,143 identical "$36 Overdraft Item
// Fee" rows all stamped on one date). No real account has the same merchant +
// amount this many times on the same day, so cap at a sane maximum.
const MAX_IDENTICAL = 8;
function capIdentical<T extends { date: string; amount: number; description: string }>(
  items: T[],
  max = MAX_IDENTICAL,
): { kept: T[]; dropped: number } {
  const seen = new Map<string, number>();
  const kept: T[] = [];
  let dropped = 0;
  for (const it of items || []) {
    const key = `${it.date}|${Math.round(Number(it.amount) * 100)}|${(it.description || "").trim().toLowerCase()}`;
    const n = seen.get(key) || 0;
    if (n < max) {
      kept.push(it);
      seen.set(key, n + 1);
    } else {
      dropped++;
    }
  }
  return { kept, dropped };
}

// Gig EARNINGS the AI sometimes files as expenses (seen: 109 "Trip Earnings"
// lines dumped into Other expenses, inflating spend and undercounting income,
// which can wrongly disqualify a driver). These are money IN, so move them back
// to income.
// Money-IN the model misfiled as an expense that we count as real INCOME:
// gig payouts, payroll/direct deposits, and deposited checks / ACH credits /
// wires (an identifiable payer sent money). NOT a bare "check #1234" — that is
// usually a check the customer WROTE (money out), so we don't match it.
const GIG_INCOME_PATTERNS = [
  /trip\s*(earnings|fare|pay|payment)/i,
  /\bearnings\b/i,
  /instant\s*pay/i,
  /(driver|courier|delivery)\s*(pay|payout|earnings)/i,
  /weekly\s*payout/i,
  /\bpayout\b/i,
  /direct\s*dep(osit)?/i,
  /mobile\s*deposit/i,
  /remote\s*deposit/i,
  /check\s*deposit/i,
  /deposit(ed)?\s*(of\s*)?check/i,
  /\bach\s*credit\b/i,
  /incoming\s*wire/i,
];
// Money-IN that is NOT spending but is UNVERIFIABLE as income (the customer
// could be funding their own account): raw cash / ATM / teller deposits and
// generic incoming transfers. We pull these OUT of expenses (they are not
// spending) but classify them "unknown" so they DON'T inflate income either.
const NEUTRAL_DEPOSIT_PATTERNS = [
  /cash\s*deposit/i,
  /atm\s*deposit/i,
  /teller\s*deposit/i,
  /branch\s*deposit/i,
  /counter\s*deposit/i,
  /deposit\s*(ref|#|no\b)/i,
  /incoming\s*(ach|transfer)/i,
];
function looksLikeGigIncome(desc: string): boolean {
  return GIG_INCOME_PATTERNS.some((r) => r.test(desc || ""));
}
function looksLikeNeutralDeposit(desc: string): boolean {
  return NEUTRAL_DEPOSIT_PATTERNS.some((r) => r.test(desc || ""));
}

// Sanitize a parsed summary before it feeds underwriting:
//   1. cap runaway duplicate deposits + expenses (AI repetition),
//   2. move gig-earnings lines miscounted as expenses back to income,
//   3. drop deposits from known spending merchants (purchases miscounted as income),
//   4. RECOMPUTE the income figures from the cleaned deposit list rather than
//      trusting the AI's self-reported monthlyIncome.
function sanitizeSummary(summary: ParsedStatementSummary): ParsedStatementSummary {
  const exp = capIdentical(summary.expenses ?? []);
  const dep = capIdentical(summary.deposits ?? []);

  // Split expenses three ways: real spending stays; money-in the AI misfiled as
  // an expense is pulled out — counted as income when it's an identifiable payer
  // (gig/payroll/check/ACH/wire), or moved to a neutral "unknown" deposit when
  // it's a raw cash/ATM deposit (money in, but not verifiable income).
  const realExpenses: ParsedExpense[] = [];
  const movedToIncome: ParsedDeposit[] = [];
  const movedToNeutral: ParsedDeposit[] = [];
  for (const e of exp.kept) {
    if (looksLikeGigIncome(e.description)) {
      movedToIncome.push({
        date: e.date,
        amount: Math.abs(Number(e.amount)) || 0,
        description: e.description,
        platform: (e.description || "").trim() || "Gig earnings",
        classification: "income",
      });
    } else if (looksLikeNeutralDeposit(e.description)) {
      movedToNeutral.push({
        date: e.date,
        amount: Math.abs(Number(e.amount)) || 0,
        description: e.description,
        platform: (e.description || "").trim() || "Cash deposit",
        classification: "unknown",
      });
    } else {
      realExpenses.push(e);
    }
  }

  const cleanedDeposits = dep.kept.map((d) =>
    isSpendingMerchant(d) ? { ...d, classification: "unknown" as const } : d,
  );
  const allDeposits = [...cleanedDeposits, ...movedToIncome, ...movedToNeutral];
  const excludedMerchant = dep.kept.filter(isSpendingMerchant).length;
  if (exp.dropped || dep.dropped || excludedMerchant || movedToIncome.length || movedToNeutral.length) {
    console.warn(
      `[parseStatementsWithAI] sanitized: capped ${exp.dropped} exp + ${dep.dropped} dep dupes, dropped ${excludedMerchant} merchant deposits, moved ${movedToIncome.length} earnings expenses to income + ${movedToNeutral.length} cash/ATM deposits to neutral`,
    );
  }
  const f = computeIncomeFields(allDeposits);
  return {
    ...summary,
    deposits: allDeposits,
    expenses: realExpenses,
    monthlyIncome: f.monthlyIncome,
    avgWeeklyIncome: f.avgWeeklyIncome,
    depositCount: f.depositCount,
    largestDeposit: f.largestDeposit,
  };
}

export async function parseStatementsWithAI(
  pdfs: Array<{ filename: string; buffer: Buffer; mimeType: string }>,
): Promise<ParsedStatementSummary> {
  if (pdfs.length === 0) throw new Error("No statements provided");

  const ai = getClient();

  // A single call over many statements can overflow the output-token limit
  // (dropping whole months of deposits). Parse each statement in its own call
  // so no single response can truncate, then merge. This guarantees every
  // month shows up in the income-by-platform breakdown.
  if (pdfs.length === 1) return sanitizeSummary(await parseOneBatch(ai, pdfs));

  // Parse all statements concurrently. Sequential calls tripled the wall time
  // and tripped the gateway request timeout ("unexpected response from the
  // server"); running them in parallel keeps total time near a single call.
  const settled = await Promise.allSettled(pdfs.map((pdf) => parseOneBatch(ai, [pdf])));
  const summaries: ParsedStatementSummary[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") summaries.push(r.value);
    else console.error("[parseStatementsWithAI] a statement failed to parse:", pdfs[i].filename, r.reason);
  });
  if (summaries.length === 0) throw new Error("All statements failed to parse");

  return sanitizeSummary(mergeSummaries(summaries));
}
