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
};

export type ParsedStatementSummary = {
  accountHolderName: string | null;
  bankName: string | null;
  statementPeriodStart: string | null; // ISO yyyy-mm-dd
  statementPeriodEnd: string | null; // ISO yyyy-mm-dd
  deposits: ParsedDeposit[];
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
      "classification": "income" | "transfer" | "refund" | "unknown"
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

export async function parseStatementsWithAI(
  pdfs: Array<{ filename: string; buffer: Buffer; mimeType: string }>,
): Promise<ParsedStatementSummary> {
  if (pdfs.length === 0) throw new Error("No statements provided");

  const ai = getClient();

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
    },
  });

  const text = result.text;
  if (!text) throw new Error("Empty response from Gemini");

  let parsed: ParsedStatementSummary;
  try {
    parsed = JSON.parse(text) as ParsedStatementSummary;
  } catch (err) {
    throw new Error(`Failed to parse Gemini response as JSON: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // Defensive normalization — Gemini might return strings, missing fields, etc.
  parsed.monthlyIncome = Number(parsed.monthlyIncome) || 0;
  parsed.avgWeeklyIncome = Number(parsed.avgWeeklyIncome) || 0;
  parsed.depositCount = Number(parsed.depositCount) || 0;
  parsed.largestDeposit = Number(parsed.largestDeposit) || 0;
  parsed.deposits = Array.isArray(parsed.deposits) ? parsed.deposits : [];

  return parsed;
}
