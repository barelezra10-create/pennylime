import { spawn } from "child_process";
import { prisma } from "@/lib/db";
import { getPlatformRisk } from "@/lib/platform-risk";
import { calculateRemainingBalance } from "@/lib/amortization";
import { getLoanRules } from "@/lib/rules-engine";
import type { RiskScoreResult } from "@/types";

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CachedModel {
  id: string;
  version: number;
  coefficients: number[];
  intercept: number;
  featureNames: string[];
  trainingSize: number;
  accuracy: number;
  cachedAt: number;
}

const MODEL_TTL_MS = 5 * 60 * 1000; // 5 minutes
let modelCache: CachedModel | null = null;

// ---------------------------------------------------------------------------
// 1. loadActiveModel
// ---------------------------------------------------------------------------

export async function loadActiveModel(): Promise<CachedModel | null> {
  const now = Date.now();
  if (modelCache && now - modelCache.cachedAt < MODEL_TTL_MS) {
    return modelCache;
  }

  const model = await prisma.riskModel.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  if (!model) {
    modelCache = null;
    return null;
  }

  modelCache = {
    id: model.id,
    version: model.version,
    coefficients: JSON.parse(model.coefficients) as number[],
    intercept: model.intercept,
    featureNames: JSON.parse(model.features) as string[],
    trainingSize: model.trainingSize,
    accuracy: model.accuracy,
    cachedAt: now,
  };

  return modelCache;
}

// ---------------------------------------------------------------------------
// 2. extractFeatures
// ---------------------------------------------------------------------------

export interface RepaymentHistory {
  totalPayments: number;
  lateCount: number;
  hasDefault: boolean;
}

export function extractFeatures(
  application: {
    loanAmount: { toNumber(): number } | number | null;
    loanTermMonths: number | null;
    monthlyIncome: { toNumber(): number } | number | null;
    bankBalance: { toNumber(): number } | number | null;
    platform: string | null | undefined;
  },
  activeLoanBalance: number | null,
  repaymentHistory: RepaymentHistory | null,
  documentCount: number,
  requiredDocs: number
): { name: string; rawValue: number | null; normalizedValue: number }[] {
  const toNum = (
    v: { toNumber(): number } | number | null | undefined
  ): number | null => {
    if (v == null) return null;
    if (typeof v === "number") return v;
    return v.toNumber();
  };

  const loanAmount = toNum(application.loanAmount) ?? 0;
  const termMonths = application.loanTermMonths ?? 6;
  const monthlyIncome = toNum(application.monthlyIncome);
  const bankBalance = toNum(application.bankBalance);

  // 1. income_to_loan_ratio
  let incomeLoanRaw: number | null = null;
  let incomeLoanNorm: number;
  if (monthlyIncome != null && loanAmount > 0) {
    incomeLoanRaw = (monthlyIncome * termMonths) / loanAmount;
    incomeLoanNorm = Math.min(incomeLoanRaw, 5.0) / 5.0;
  } else {
    incomeLoanNorm = 0.5; // null fallback 2.5 → normalized 0.5
  }

  // 2. bank_balance_ratio
  let bankBalRaw: number | null = null;
  let bankBalNorm: number;
  if (bankBalance != null && loanAmount > 0) {
    bankBalRaw = bankBalance / loanAmount;
    bankBalNorm = Math.min(bankBalRaw, 2.0) / 2.0;
  } else {
    bankBalNorm = 0.5; // null fallback 1.0 → normalized 0.5
  }

  // 3. platform_risk
  const platformRiskRaw = getPlatformRisk(application.platform);

  // 4. loan_term
  const loanTermRaw = termMonths;
  const loanTermNorm = termMonths / 18;

  // 5. document_score
  const safeRequired = requiredDocs > 0 ? requiredDocs : 1;
  const docScoreRaw = documentCount;
  const docScoreNorm = Math.min(documentCount, safeRequired) / safeRequired;

  // 6. repayment_history
  let repayRaw: number | null = null;
  let repayNorm: number;
  if (repaymentHistory != null && repaymentHistory.totalPayments > 0) {
    const lateRatio =
      repaymentHistory.lateCount / repaymentHistory.totalPayments;
    repayRaw = (1 - lateRatio) * (repaymentHistory.hasDefault ? 0.5 : 1.0);
    repayNorm = repayRaw;
  } else {
    repayNorm = 0.5;
  }

  // 7. aggregate_exposure
  let exposureRaw: number | null = null;
  let exposureNorm: number;
  if (activeLoanBalance != null && monthlyIncome != null && monthlyIncome > 0) {
    exposureRaw = activeLoanBalance / (monthlyIncome * 3);
    exposureNorm = Math.min(exposureRaw, 3.0) / 3.0;
  } else {
    exposureNorm = 0.0;
  }

  return [
    { name: "income_to_loan_ratio", rawValue: incomeLoanRaw, normalizedValue: incomeLoanNorm },
    { name: "bank_balance_ratio", rawValue: bankBalRaw, normalizedValue: bankBalNorm },
    { name: "platform_risk", rawValue: platformRiskRaw, normalizedValue: platformRiskRaw },
    { name: "loan_term", rawValue: loanTermRaw, normalizedValue: loanTermNorm },
    { name: "document_score", rawValue: docScoreRaw, normalizedValue: docScoreNorm },
    { name: "repayment_history", rawValue: repayRaw, normalizedValue: repayNorm },
    { name: "aggregate_exposure", rawValue: exposureRaw, normalizedValue: exposureNorm },
  ];
}

// ---------------------------------------------------------------------------
// 3. computeRiskScore
// ---------------------------------------------------------------------------

export function computeRiskScore(
  features: { name: string; rawValue: number | null; normalizedValue: number }[],
  coefficients: number[],
  intercept: number
): number {
  let dot = intercept;
  for (let i = 0; i < features.length && i < coefficients.length; i++) {
    dot += features[i].normalizedValue * coefficients[i];
  }
  // sigmoid
  const sigmoid = 1 / (1 + Math.exp(-dot));
  return Math.round(sigmoid * 100 * 100) / 100; // score 0-100, 2 decimal places
}

// ---------------------------------------------------------------------------
// 4. calculateRate
// ---------------------------------------------------------------------------

export async function calculateRate(riskScore: number): Promise<number> {
  const rules = await getLoanRules();
  const minRate = Number(rules.min_interest_rate ?? "30");
  const maxRate = Number(rules.max_interest_rate ?? "60");
  // Linear interpolation: score=0 → minRate, score=100 → maxRate
  const rate = minRate + (riskScore / 100) * (maxRate - minRate);
  return Math.round(rate * 100) / 100;
}

// ---------------------------------------------------------------------------
// 5. scoreApplication
// ---------------------------------------------------------------------------

export async function scoreApplication(
  applicationId: string
): Promise<RiskScoreResult> {
  const rules = await getLoanRules();
  const minRate = Number(rules.min_interest_rate ?? "30");
  const requiredDocs = Number(rules.required_pay_stubs ?? "3");

  // Load application with documents and payments
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { documents: true, payments: true },
  });

  if (!application) {
    throw new Error(`Application not found: ${applicationId}`);
  }

  // Load active model
  const model = await loadActiveModel();

  if (!model) {
    // No model available, fallback
    return {
      riskScore: 50,
      interestRate: minRate,
      modelId: null,
      features: [],
    };
  }

  // Repayment history via ssnHash from RiskProfile
  let repaymentHistory: RepaymentHistory | null = null;
  if (application.ssnHash) {
    const profiles = await prisma.riskProfile.findMany({
      where: { ssnHash: application.ssnHash },
      select: { latePaymentCount: true, outcome: true, loanTermMonths: true },
    });

    if (profiles.length > 0) {
      const totalPayments = profiles.reduce(
        (sum, p) => sum + p.loanTermMonths,
        0
      );
      const lateCount = profiles.reduce(
        (sum, p) => sum + p.latePaymentCount,
        0
      );
      const hasDefault = profiles.some((p) => p.outcome === "DEFAULT");
      repaymentHistory = { totalPayments, lateCount, hasDefault };
    }
  }

  // Active loan exposure: sum remaining balance across other non-rejected, funded apps
  let activeLoanBalance: number | null = null;
  if (application.ssnHash) {
    const otherApps = await prisma.application.findMany({
      where: {
        ssnHash: application.ssnHash,
        id: { not: applicationId },
        status: { notIn: ["REJECTED", "PENDING"] },
      },
      include: { payments: true },
    });

    if (otherApps.length > 0) {
      activeLoanBalance = otherApps.reduce((sum, app) => {
        const balance = calculateRemainingBalance(
          app.payments.map((p) => ({
            principal: Number(p.principal),
            status: p.status,
          }))
        );
        return sum + balance;
      }, 0);
    }
  }

  const documentCount = application.documents.length;

  const featureVector = extractFeatures(
    application,
    activeLoanBalance,
    repaymentHistory,
    documentCount,
    requiredDocs
  );

  const riskScore = computeRiskScore(
    featureVector,
    model.coefficients,
    model.intercept
  );

  const interestRate = await calculateRate(riskScore);

  const featuresWithWeight: RiskScoreResult["features"] = featureVector.map(
    (f, i) => ({
      name: f.name,
      rawValue: f.rawValue,
      normalizedValue: f.normalizedValue,
      weight: model.coefficients[i] ?? 0,
    })
  );

  return {
    riskScore,
    interestRate,
    modelId: model.id,
    features: featuresWithWeight,
  };
}

// ---------------------------------------------------------------------------
// 6. checkAndTriggerRetrain
// ---------------------------------------------------------------------------

const RETRAIN_THRESHOLD_KEY = "retrain_threshold";
const COMPLETED_SINCE_KEY = "completed_since_last_train";

export async function checkAndTriggerRetrain(): Promise<void> {
  const result = await prisma.$transaction(async (tx) => {
    // Upsert the counter row
    const current = await tx.loanRule.findUnique({
      where: { key: COMPLETED_SINCE_KEY },
    });

    const currentCount = current ? Number(current.value) : 0;
    const newCount = currentCount + 1;

    await tx.loanRule.upsert({
      where: { key: COMPLETED_SINCE_KEY },
      create: {
        key: COMPLETED_SINCE_KEY,
        value: String(newCount),
        description: "Number of completed loans since last model retrain",
      },
      update: { value: String(newCount) },
    });

    // Read threshold
    const thresholdRow = await tx.loanRule.findUnique({
      where: { key: RETRAIN_THRESHOLD_KEY },
    });
    const threshold = thresholdRow ? Number(thresholdRow.value) : 100;

    return { newCount, threshold };
  });

  if (result.newCount >= result.threshold) {
    // Reset counter
    await prisma.loanRule.update({
      where: { key: COMPLETED_SINCE_KEY },
      data: { value: "0" },
    });

    // Invalidate model cache so next request re-loads after retrain
    modelCache = null;

    // Spawn Python retrain script in background
    const child = spawn("python3", ["scripts/train_risk_model.py", "--retrain"], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
    });
    child.unref();
  }
}
