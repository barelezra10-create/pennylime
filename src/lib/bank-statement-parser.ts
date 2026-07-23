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

// gemini-2.5-flash-lite is the most permissive recent model — accessible
// on brand-new API keys that 403 on gemini-2.5-flash and 404 on the
// deprecated gemini-2.0-flash. Supports PDF input natively. Override
// with GEMINI_PARSE_MODEL on Railway if a more capable tier is approved.
const MODEL = process.env.GEMINI_PARSE_MODEL || "gemini-2.5-flash-lite";

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
  estimatedCadence: "weekly" | "biweekly" | "semi-monthly" | "monthly" | "irregular" | "unknown";
  confidence: "high" | "medium" | "low";
  notes: string | null;
};

const SYSTEM_PROMPT = `You are an underwriting analyst at PennyLime, a cash-advance product for gig workers. You will be given one or more PDF bank statements. Your job is to extract a structured income summary.

Rules:
- Only count INCOME deposits (gig-platform payouts: Uber, Lyft, DoorDash, Instacart, Amazon Flex, Grubhub, freelance/contract income, payroll). Skip transfers between accounts, refunds, ATM credits, ACH credits FROM the customer themselves.
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
- Do NOT put income in "expenses" and do NOT put money-out in "deposits". Return expenses sorted oldest first.

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

  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0,
      responseMimeType: "application/json",
      // Statements with many small daily gig payouts produce a long deposit
      // array. Give the model plenty of room so the JSON isn't cut off
      // mid-array (which yields "Unterminated string" parse errors).
      maxOutputTokens: 65536,
    },
  });

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

  return parsed;
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
  if (pdfs.length === 1) return parseOneBatch(ai, pdfs);

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

  return mergeSummaries(summaries);
}
