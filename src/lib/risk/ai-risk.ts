/**
 * AI-driven risk analysis for PennyLime cash advance applications.
 *
 * Reads the application's verified income (from Plaid Assets OR manual
 * bank-statement parsing — both populate the same fields), deposit
 * cadence, balance, worker context, and recent transaction patterns,
 * then asks Gemini to underwrite. Returns a 0-100 risk score, a
 * recommended weekly compound rate (3-7%), an APPROVE/REVIEW/REJECT
 * verdict, and structured green/red flags with reasoning.
 *
 * Output is saved on the Application (aiRiskScore, aiRecommendedRate,
 * aiRiskVerdict, aiRiskAnalysisJson, aiRiskAnalysisAt) so the admin
 * card can show it without re-running.
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";

const MODEL = process.env.GEMINI_RISK_MODEL || "gemini-2.5-flash";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  client = new GoogleGenAI({ apiKey });
  return client;
}

export type KeyFactor = {
  factor: string;
  value: string;
  impact: "positive" | "negative" | "neutral";
};

export type AiRiskAnalysis = {
  riskScore: number; // 0-100, higher = riskier
  recommendedWeeklyRate: number; // 3.0-7.0
  recommendedMaxAmount: number; // suggested approval ceiling
  verdict: "APPROVE" | "MANUAL_REVIEW" | "REJECT";
  confidence: "high" | "medium" | "low";
  summary: string; // 1-2 sentence underwriter summary
  greenFlags: string[]; // positives
  redFlags: string[]; // negatives
  keyFactors: KeyFactor[];
  // Internal — for debugging
  generatedAt: string;
  modelUsed: string;
};

const SYSTEM_PROMPT = `You are a senior underwriter at PennyLime, a cash-advance product for US gig workers (Uber/Lyft/DoorDash/Instacart/Amazon Flex/freelance). Your job: assess credit risk on a single applicant using their verified bank data and produce a structured underwriting decision.

PRODUCT CONTEXT
- Cash advance, not a loan. Repaid through equal weekly ACH debits over 4-12 weeks.
- We purchase a portion of future receivables — there is no traditional credit check.
- Pricing is a weekly compound rate (3-7%). Lower risk = lower rate. Typical safe applicant gets 4-5%. High risk gets 6-7%. Reject anyone we'd lose money on.
- We are exposed to:
    * Non-sufficient funds (NSF) when we debit
    * Sudden income drop (lost gig job, deactivated)
    * Over-borrowing (concurrent MCAs from other lenders draining their account)
    * Identity fraud (rare with Plaid-linked accounts)

RISK FACTORS (the things that matter, in rough order)
1. **Income consistency.** Steady weekly deposits from a gig platform = green. Spiky / one-off deposits = red.
2. **Income vs requested amount.** Total weekly debit should be ≤ 25% of weekly income. ≤15% is safe.
3. **Account balance.** Frequently low / overdraft = NSF risk. Consistent buffer = safe.
4. **Time on platform.** 6+ months stable income = green. <3 months = red.
5. **Concurrent debt.** If transactions show other MCA/lender ACH debits, that's a red flag.
6. **Deposit count.** Many small deposits (50+ in 90 days) = active gig worker. Few large = irregular freelancer.
7. **Worker type.** Uber / DoorDash drivers historically perform; Amazon Flex is mixed; new platforms unknown.

OUTPUT
Return STRICT JSON (no markdown, no fences). Schema:
{
  "riskScore": number (0-100, higher = riskier),
  "recommendedWeeklyRate": number (3.0-7.0, one decimal place),
  "recommendedMaxAmount": number (the max safe advance based on income; usually 1-1.5x weekly income, but capped by what they requested),
  "verdict": "APPROVE" | "MANUAL_REVIEW" | "REJECT",
  "confidence": "high" | "medium" | "low",
  "summary": string (1-2 sentences, plain language a non-technical owner can read),
  "greenFlags": string[] (3-6 specific positives. Each must be concrete, e.g. "$1,100/wk consistent Uber deposits for 18 months", NOT "good income"),
  "redFlags": string[] (0-4 specific negatives. Same rule — concrete, not generic),
  "keyFactors": [
    { "factor": string, "value": string, "impact": "positive" | "negative" | "neutral" },
    ... (5-8 factors covering the dimensions above)
  ]
}

GUIDELINES
- If the data is too thin (no income data, no balance, no deposit history), set verdict = "MANUAL_REVIEW", confidence = "low", and explain why in summary.
- Never approve someone with verified monthly income below $1,500.
- If you see ANY concurrent-MCA pattern (regular ACH debits like "FUNDBOX", "ONDECK", "KAPITUS", "RAPID FINANCE", "BLUEVINE", etc.), reject or escalate to MANUAL_REVIEW.
- Be brutally honest. Don't paper over red flags.`;

type AnalyzableApplication = {
  id: string;
  firstName: string;
  lastName: string;
  workerType: string | null;
  workStartMonth: number | null;
  workStartYear: number | null;
  loanAmount: { toString(): string };
  monthlyIncome: { toString(): string } | null;
  refinedMonthlyIncome: { toString(): string } | null;
  avgWeeklyIncome: { toString(): string } | null;
  depositCount90d: number | null;
  largestDeposit: { toString(): string } | null;
  depositCadence: string | null;
  availableBalance: { toString(): string } | null;
  bankBalance: { toString(): string } | null;
  plaidInstitutionName: string | null;
  plaidAccountSubtype: string | null;
  lastPlaidRefresh: Date | null;
  preferredChargeDay: number | null;
};

function buildPrompt(app: AnalyzableApplication): string {
  const fmt = (v: { toString(): string } | null | undefined) =>
    v == null ? "(unknown)" : `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const num = (v: number | null | undefined) => (v == null ? "(unknown)" : v.toString());

  const monthsOnPlatform = (() => {
    if (!app.workStartMonth || !app.workStartYear) return "(unknown)";
    const now = new Date();
    const start = new Date(app.workStartYear, app.workStartMonth - 1, 1);
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    return `${months} months`;
  })();

  const incomeMonthly = app.refinedMonthlyIncome ?? app.monthlyIncome;
  const weeklyIncome = app.avgWeeklyIncome;

  return `APPLICANT PROFILE
- Name: ${app.firstName} ${app.lastName}
- Worker type / platform: ${app.workerType ?? "(not stated)"}
- Time on platform: ${monthsOnPlatform}
- Requested advance: ${fmt(app.loanAmount)}

VERIFIED INCOME (from Plaid Assets / AI-parsed bank statements)
- Monthly income: ${fmt(incomeMonthly)}
- Average weekly income: ${fmt(weeklyIncome)}
- Deposit count (last 90 days): ${num(app.depositCount90d)}
- Largest single deposit: ${fmt(app.largestDeposit)}
- Estimated cadence: ${app.depositCadence ?? "(unknown)"}
- Preferred charge day (computed from deposit pattern): ${app.preferredChargeDay == null ? "(unknown)" : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][app.preferredChargeDay]}

BANK ACCOUNT
- Institution: ${app.plaidInstitutionName ?? "(unknown)"}
- Account type: ${app.plaidAccountSubtype ?? "(unknown)"}
- Available balance: ${fmt(app.availableBalance ?? app.bankBalance)}
- Last data refresh: ${app.lastPlaidRefresh ? app.lastPlaidRefresh.toISOString().slice(0, 10) : "(unknown)"}

Underwrite this applicant per the rules above. Return the JSON now.`;
}

function stripCodeFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Runs Gemini against a single application and returns the analysis.
 * Does NOT persist — call from a server action that wraps it with auth
 * and saves the result.
 */
export async function analyzeRiskWithAi(applicationId: string): Promise<AiRiskAnalysis> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      workerType: true,
      workStartMonth: true,
      workStartYear: true,
      loanAmount: true,
      monthlyIncome: true,
      refinedMonthlyIncome: true,
      avgWeeklyIncome: true,
      depositCount90d: true,
      largestDeposit: true,
      depositCadence: true,
      availableBalance: true,
      bankBalance: true,
      plaidInstitutionName: true,
      plaidAccountSubtype: true,
      lastPlaidRefresh: true,
      preferredChargeDay: true,
    },
  });
  if (!app) throw new Error("Application not found");

  const prompt = buildPrompt(app as AnalyzableApplication);
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }, { text: prompt }] },
    ],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const raw = response.text ?? "";
  const cleaned = stripCodeFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON: ${(err as Error).message}. Raw: ${raw.slice(0, 300)}`);
  }

  // Light validation + defaults, in case the model omits a field.
  const p = parsed as Partial<AiRiskAnalysis>;
  const result: AiRiskAnalysis = {
    riskScore: clamp(Number(p.riskScore ?? 50), 0, 100),
    recommendedWeeklyRate: clamp(Number(p.recommendedWeeklyRate ?? 5), 3, 7),
    recommendedMaxAmount: Number(p.recommendedMaxAmount ?? 0) || Number(app.loanAmount),
    verdict: (p.verdict === "APPROVE" || p.verdict === "REJECT") ? p.verdict : "MANUAL_REVIEW",
    confidence: (p.confidence === "high" || p.confidence === "low") ? p.confidence : "medium",
    summary: String(p.summary ?? "").trim() || "No summary provided.",
    greenFlags: Array.isArray(p.greenFlags) ? p.greenFlags.map(String) : [],
    redFlags: Array.isArray(p.redFlags) ? p.redFlags.map(String) : [],
    keyFactors: Array.isArray(p.keyFactors)
      ? p.keyFactors
          .filter((f): f is KeyFactor => !!f && typeof f === "object" && "factor" in f)
          .map((f) => ({
            factor: String(f.factor ?? ""),
            value: String(f.value ?? ""),
            impact:
              f.impact === "positive" || f.impact === "negative" ? f.impact : "neutral",
          }))
      : [],
    generatedAt: new Date().toISOString(),
    modelUsed: MODEL,
  };
  return result;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
