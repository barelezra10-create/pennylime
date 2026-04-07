# Phase 3: Risk Scoring & Dynamic Pricing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded 30% interest rate with a data-driven logistic regression model that scores applications 0-100 and maps to a continuous interest rate, trained via Python and served via TypeScript inference.

**Architecture:** Python (scikit-learn) trains the model and exports coefficients to a `RiskModel` DB table. TypeScript loads the active model, extracts 7 features from application data, runs logistic regression inference (dot product + sigmoid), and maps the risk score to an interest rate via `minRate + (maxRate - minRate) * (score / 100)`. Auto-retrains when enough completed loans accumulate.

**Tech Stack:** Python 3 + scikit-learn + numpy + pandas (training); TypeScript (inference); Prisma + SQLite (storage); Next.js 16 server actions (integration)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/risk-model.ts` | TS inference: load model, extract features, compute score, calculate rate |
| `src/lib/platform-risk.ts` | Gig platform risk factor lookup table (14 platforms → 0-1 values) |
| `scripts/train_risk_model.py` | Python training: seed mode (cold-start from synthetic data) + retrain mode (from real RiskProfile data) |
| `scripts/requirements.txt` | Python deps: scikit-learn, numpy, pandas |

### Modified Files

| File | Change Summary |
|------|---------------|
| `prisma/schema.prisma` | Add `RiskModel` table; add `bankBalance`, `riskModelId` to Application; add `ssnHash` to RiskProfile |
| `prisma/seed.mts` | Add new LoanRules: max_interest_rate, retrain_threshold, retrain_min_data, default_threshold_days, completed_since_last_train |
| `src/lib/rules-engine.ts` | Call `scoreApplication()` for rate; relax SSN duplicate check to only block PENDING/APPROVED |
| `src/actions/applications.ts` | Remove SSN duplicate block for funded loans; `approveApplication()` auto-sets rate from model; store riskScore + riskModelId |
| `src/actions/plaid.ts` | Add `accountsBalanceGet()` call after token exchange; store bankBalance |
| `src/app/admin/applications/[id]/detail-client.tsx` | Replace ad-hoc risk display with model-driven score card, feature breakdown, history section; remove rate input |
| `src/app/admin/settings/settings-client.tsx` | Add Model Info panel (read-only) |
| `src/app/api/cron/payment-status/route.ts` | Create RiskProfile on PAID_OFF; increment retrain counter; check threshold |
| `src/app/api/cron/collections/route.ts` | Add DEFAULTED escalation (90+ days); create RiskProfile; increment retrain counter; include COLLECTIONS in query |
| `src/types/index.ts` | Add RiskScoreResult type |

---

## Chunk 1: Database & Core Infrastructure

### Task 1: Schema Migration — RiskModel Table + Application Changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add RiskModel table and Application columns**

Add after the `CollectionEvent` model at the end of `prisma/schema.prisma`:

```prisma
model RiskModel {
  id           String   @id @default(uuid())
  version      Int
  coefficients String   // JSON: array of floats
  intercept    Float
  features     String   // JSON: feature names + normalization params
  trainingSize Int
  accuracy     Float
  precision    Float
  recall       Float
  isActive     Boolean  @default(false)
  createdAt    DateTime @default(now())
}
```

Add to the `Application` model after `riskScore`:

```prisma
  bankBalance   Decimal?
  riskModelId   String?
```

Add to the `RiskProfile` model after `applicationId`:

```prisma
  ssnHash       String
  @@index([ssnHash])
```

- [ ] **Step 2: Run migration**

Run: `npx prisma migrate dev --name add-risk-model-and-fields`
Expected: Migration applied successfully, Prisma Client regenerated.

- [ ] **Step 3: Verify by running build**

Run: `npm run build`
Expected: Build passes (no type errors from schema changes since new fields are optional).

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add RiskModel table, bankBalance + riskModelId on Application, ssnHash on RiskProfile"
```

---

### Task 2: Seed New LoanRules

**Files:**
- Modify: `prisma/seed.mts`

- [ ] **Step 1: Add new rules to seed**

Add after the `collections_threshold_days` upsert block (after line 121 in `prisma/seed.mts`):

```typescript
  await prisma.loanRule.upsert({
    where: { key: "max_interest_rate" },
    update: {},
    create: {
      key: "max_interest_rate",
      value: "36",
      description: "Ceiling interest rate for highest-risk borrowers",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "retrain_threshold" },
    update: {},
    create: {
      key: "retrain_threshold",
      value: "50",
      description: "Number of completed loans before auto-retraining the risk model",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "retrain_min_data" },
    update: {},
    create: {
      key: "retrain_min_data",
      value: "30",
      description: "Minimum total training samples required to retrain the model",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "default_threshold_days" },
    update: {},
    create: {
      key: "default_threshold_days",
      value: "90",
      description: "Days in COLLECTIONS before escalating to DEFAULTED",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "completed_since_last_train" },
    update: {},
    create: {
      key: "completed_since_last_train",
      value: "0",
      description: "Counter of completed loans since last model training (internal)",
    },
  });
```

- [ ] **Step 2: Run seed**

Run: `npx prisma db seed`
Expected: Seed completes, new rules created.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.mts
git commit -m "feat: seed new LoanRules for risk model configuration"
```

---

### Task 3: Platform Risk Lookup Table

**Files:**
- Create: `src/lib/platform-risk.ts`

- [ ] **Step 1: Create platform risk factors**

Create `src/lib/platform-risk.ts`:

```typescript
/**
 * Gig platform risk factors (0-1 scale).
 * Lower = less risky. Based on income stability and platform maturity.
 * These values serve as the cold-start baseline; the ML model learns
 * actual risk from loan outcomes over time.
 */
const PLATFORM_RISK: Record<string, number> = {
  uber: 0.25,
  lyft: 0.30,
  doordash: 0.35,
  grubhub: 0.40,
  instacart: 0.35,
  postmates: 0.45,
  amazon_flex: 0.30,
  shipt: 0.40,
  taskrabbit: 0.55,
  fiverr: 0.60,
  upwork: 0.50,
  rover: 0.55,
  handy: 0.60,
  thumbtack: 0.55,
};

const DEFAULT_RISK = 0.5;

/**
 * Get the risk factor for a gig platform.
 * Returns 0-1 where higher = riskier.
 * Returns 0.5 (neutral) for unknown platforms.
 */
export function getPlatformRisk(platform: string | null | undefined): number {
  if (!platform) return DEFAULT_RISK;
  return PLATFORM_RISK[platform.toLowerCase()] ?? DEFAULT_RISK;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add src/lib/platform-risk.ts
git commit -m "feat: add gig platform risk factor lookup table"
```

---

### Task 4: Risk Score Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add RiskScoreResult type**

Add after the `StorageProvider` interface in `src/types/index.ts`:

```typescript
export interface RiskScoreResult {
  riskScore: number;
  interestRate: number;
  modelId: string | null;
  features: {
    name: string;
    rawValue: number | null;
    normalizedValue: number;
    weight: number;
  }[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add RiskScoreResult type"
```

---

### Task 5: TypeScript Inference Engine

**Files:**
- Create: `src/lib/risk-model.ts`

- [ ] **Step 1: Create the inference engine**

Create `src/lib/risk-model.ts`:

```typescript
import { prisma } from "@/lib/db";
import { getPlatformRisk } from "@/lib/platform-risk";
import { getLoanRules } from "@/lib/rules-engine";
import { calculateRemainingBalance } from "@/lib/amortization";
import type { RiskScoreResult } from "@/types";

interface ModelData {
  id: string;
  coefficients: number[];
  intercept: number;
  features: { name: string; cap: number; divisor: number }[];
  loadedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedModel: ModelData | null = null;

/**
 * Load the active risk model from the database.
 * Cached for 5 minutes to avoid repeated DB reads.
 */
export async function loadActiveModel(): Promise<ModelData | null> {
  if (cachedModel && Date.now() - cachedModel.loadedAt < CACHE_TTL_MS) {
    return cachedModel;
  }

  const model = await prisma.riskModel.findFirst({
    where: { isActive: true },
  });

  if (!model) {
    cachedModel = null;
    return null;
  }

  cachedModel = {
    id: model.id,
    coefficients: JSON.parse(model.coefficients) as number[],
    intercept: model.intercept,
    features: JSON.parse(model.features) as { name: string; cap: number; divisor: number }[],
    loadedAt: Date.now(),
  };

  return cachedModel;
}

/**
 * Normalize a single feature value: cap then divide.
 */
function normalize(value: number, cap: number, divisor: number): number {
  return Math.min(value, cap) / divisor;
}

/**
 * Sigmoid function.
 */
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/**
 * Extract and normalize the 7-feature vector for an application.
 */
export function extractFeatures(
  application: {
    loanAmount: number;
    loanTermMonths: number;
    monthlyIncome: number | null;
    bankBalance: number | null;
    platform: string | null;
  },
  activeLoanBalance: number,
  repaymentHistory: { lateRatio: number; anyDefault: boolean } | null,
  documentCount: number,
  requiredDocs: number
): { name: string; rawValue: number | null; normalizedValue: number }[] {
  const { loanAmount, loanTermMonths, monthlyIncome, bankBalance, platform } = application;

  // Feature 1: Income-to-loan ratio
  const incomeRatio = monthlyIncome
    ? (monthlyIncome * loanTermMonths) / loanAmount
    : null;

  // Feature 2: Bank balance ratio
  const balanceRatio = bankBalance != null ? bankBalance / loanAmount : null;

  // Feature 3: Platform risk
  const platformRisk = getPlatformRisk(platform);

  // Feature 4: Loan term (longer = riskier)
  const termRaw = loanTermMonths;

  // Feature 5: Document score
  const docScore = Math.min(documentCount, requiredDocs) / requiredDocs;

  // Feature 6: Repayment history
  const historyRaw = repaymentHistory
    ? (1 - repaymentHistory.lateRatio) * (repaymentHistory.anyDefault ? 0.5 : 1.0)
    : null;

  // Feature 7: Aggregate exposure
  const exposureRaw = monthlyIncome
    ? activeLoanBalance / (monthlyIncome * 3)
    : null;

  return [
    { name: "income_to_loan_ratio", rawValue: incomeRatio, normalizedValue: normalize(incomeRatio ?? 2.5, 5.0, 5.0) },
    { name: "bank_balance_ratio", rawValue: balanceRatio, normalizedValue: normalize(balanceRatio ?? 1.0, 2.0, 2.0) },
    { name: "platform_risk", rawValue: platformRisk, normalizedValue: platformRisk },
    { name: "loan_term", rawValue: termRaw, normalizedValue: normalize(termRaw, 18, 18) },
    { name: "document_score", rawValue: docScore, normalizedValue: docScore },
    { name: "repayment_history", rawValue: historyRaw, normalizedValue: historyRaw ?? 0.5 },
    { name: "aggregate_exposure", rawValue: exposureRaw, normalizedValue: normalize(exposureRaw ?? 0, 3.0, 3.0) },
  ];
}

/**
 * Compute risk score (0-100) from features and model coefficients.
 * Higher score = higher probability of default = higher risk.
 */
export function computeRiskScore(
  features: { normalizedValue: number }[],
  coefficients: number[],
  intercept: number
): number {
  const z = intercept + features.reduce(
    (sum, f, i) => sum + f.normalizedValue * (coefficients[i] ?? 0),
    0
  );
  const probability = sigmoid(z);
  return Math.round(probability * 10000) / 100; // 2 decimal places
}

/**
 * Map a risk score to an interest rate using min/max bounds.
 */
export async function calculateRate(riskScore: number): Promise<number> {
  const rules = await getLoanRules();
  const minRate = parseFloat(rules.min_interest_rate ?? "30");
  const maxRate = parseFloat(rules.max_interest_rate ?? "36");
  const rate = minRate + (maxRate - minRate) * (riskScore / 100);
  return Math.round(rate * 100) / 100; // 2 decimal places
}

/**
 * Score an application end-to-end.
 * Returns risk score, interest rate, model ID, and feature breakdown.
 * Falls back to min_interest_rate if no model is active.
 */
/**
 * Increment the retrain counter and spawn retraining if threshold is met.
 * Must be called inside a context where prisma is available.
 */
export async function checkAndTriggerRetrain(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const counter = await tx.loanRule.findUnique({
      where: { key: "completed_since_last_train" },
    });
    const threshold = await tx.loanRule.findUnique({
      where: { key: "retrain_threshold" },
    });
    const newCount = parseInt(counter?.value ?? "0") + 1;
    const thresholdVal = parseInt(threshold?.value ?? "50");

    if (newCount >= thresholdVal) {
      await tx.loanRule.update({
        where: { key: "completed_since_last_train" },
        data: { value: "0" },
      });
      const { spawn } = await import("child_process");
      spawn("python3", ["scripts/train_risk_model.py", "--retrain"], {
        detached: true,
        stdio: "ignore",
      }).unref();
    } else {
      await tx.loanRule.update({
        where: { key: "completed_since_last_train" },
        data: { value: String(newCount) },
      });
    }
  });
}

export async function scoreApplication(applicationId: string): Promise<RiskScoreResult> {
  const model = await loadActiveModel();

  const application = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { documents: true },
  });

  const rules = await getLoanRules();
  const requiredDocs = parseInt(rules.required_pay_stubs ?? "3");

  // Get repayment history for repeat borrowers
  let repaymentHistory: { lateRatio: number; anyDefault: boolean } | null = null;
  if (application.ssnHash) {
    const profiles = await prisma.riskProfile.findMany({
      where: { ssnHash: application.ssnHash },
    });
    if (profiles.length > 0) {
      const totalLate = profiles.reduce((sum, p) => sum + p.latePaymentCount, 0);
      const totalPayments = profiles.reduce(
        (sum, p) => sum + Math.round(Number(p.totalOwed) / (Number(p.totalOwed) / (p.loanTermMonths || 1))),
        0
      );
      const anyDefault = profiles.some((p) => p.outcome === "DEFAULTED");
      repaymentHistory = {
        lateRatio: totalPayments > 0 ? totalLate / totalPayments : 0,
        anyDefault,
      };
    }
  }

  // Get active loan exposure for concurrent borrowers
  let activeLoanBalance = 0;
  if (application.ssnHash) {
    const activeLoans = await prisma.application.findMany({
      where: {
        ssnHash: application.ssnHash,
        id: { not: applicationId },
        status: { in: ["ACTIVE", "LATE", "COLLECTIONS"] },
      },
      include: { payments: true },
    });
    for (const loan of activeLoans) {
      activeLoanBalance += calculateRemainingBalance(
        loan.payments.map((p) => ({
          status: p.status,
          principal: Number(p.principal),
        }))
      );
    }
  }

  const features = extractFeatures(
    {
      loanAmount: Number(application.loanAmount),
      loanTermMonths: application.loanTermMonths ?? 12,
      monthlyIncome: application.monthlyIncome ? Number(application.monthlyIncome) : null,
      bankBalance: application.bankBalance ? Number(application.bankBalance) : null,
      platform: application.platform,
    },
    activeLoanBalance,
    repaymentHistory,
    application.documents.length,
    requiredDocs
  );

  // If no model, fall back to min rate
  if (!model) {
    console.warn("No active risk model found — falling back to min_interest_rate");
    const minRate = parseFloat(rules.min_interest_rate ?? "30");
    return {
      riskScore: 50, // neutral
      interestRate: minRate,
      modelId: null,
      features: features.map((f) => ({ ...f, weight: 0 })),
    };
  }

  const riskScore = computeRiskScore(features, model.coefficients, model.intercept);
  const interestRate = await calculateRate(riskScore);

  return {
    riskScore,
    interestRate,
    modelId: model.id,
    features: features.map((f, i) => ({
      ...f,
      weight: model.coefficients[i] ?? 0,
    })),
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build passes. The file imports existing modules and types.

- [ ] **Step 3: Commit**

```bash
git add src/lib/risk-model.ts
git commit -m "feat: add TypeScript risk model inference engine"
```

---

### Task 6: Python Training Script + Requirements

**Files:**
- Create: `scripts/train_risk_model.py`
- Create: `scripts/requirements.txt`

- [ ] **Step 1: Create requirements.txt**

Create `scripts/requirements.txt`:

```
scikit-learn>=1.4
numpy>=1.26
pandas>=2.1
```

- [ ] **Step 2: Create training script**

Create `scripts/train_risk_model.py`:

```python
#!/usr/bin/env python3
"""
Risk model training script for the loan portal.

Usage:
  python3 scripts/train_risk_model.py --seed     # Cold-start with synthetic data
  python3 scripts/train_risk_model.py --retrain   # Retrain from real loan outcomes

Reads/writes to the SQLite database at prisma/dev.db.
Exports model coefficients to both the RiskModel table and risk-model.json.
"""

import argparse
import json
import os
import sqlite3
import sys
import uuid
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score

DB_PATH = Path(__file__).parent.parent / "prisma" / "dev.db"
MODEL_JSON_PATH = Path(__file__).parent.parent / "risk-model.json"

FEATURE_CONFIG = [
    {"name": "income_to_loan_ratio", "cap": 5.0, "divisor": 5.0},
    {"name": "bank_balance_ratio", "cap": 2.0, "divisor": 2.0},
    {"name": "platform_risk", "cap": 1.0, "divisor": 1.0},
    {"name": "loan_term", "cap": 18.0, "divisor": 18.0},
    {"name": "document_score", "cap": 1.0, "divisor": 1.0},
    {"name": "repayment_history", "cap": 1.0, "divisor": 1.0},
    {"name": "aggregate_exposure", "cap": 3.0, "divisor": 3.0},
]

PLATFORM_RISK = {
    "uber": 0.25, "lyft": 0.30, "doordash": 0.35, "grubhub": 0.40,
    "instacart": 0.35, "postmates": 0.45, "amazon_flex": 0.30, "shipt": 0.40,
    "taskrabbit": 0.55, "fiverr": 0.60, "upwork": 0.50, "rover": 0.55,
    "handy": 0.60, "thumbtack": 0.55,
}


def normalize(value, cap, divisor):
    return min(value, cap) / divisor


def get_db():
    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}")
        sys.exit(1)
    return sqlite3.connect(str(DB_PATH))


def get_next_version(conn):
    cursor = conn.execute("SELECT MAX(version) FROM RiskModel")
    row = cursor.fetchone()
    return (row[0] or 0) + 1


def save_model(conn, coefficients, intercept, training_size, accuracy, precision, recall):
    """Save model to both DB and JSON file."""
    version = get_next_version(conn)
    model_id = str(uuid.uuid4())

    # Deactivate previous models
    conn.execute("UPDATE RiskModel SET isActive = 0 WHERE isActive = 1")

    # Insert new model
    conn.execute(
        """INSERT INTO RiskModel (id, version, coefficients, intercept, features,
           trainingSize, accuracy, precision, recall, isActive, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))""",
        (
            model_id,
            version,
            json.dumps(coefficients.tolist()),
            float(intercept),
            json.dumps(FEATURE_CONFIG),
            training_size,
            float(accuracy),
            float(precision),
            float(recall),
        ),
    )
    conn.commit()

    # Export to JSON
    model_json = {
        "id": model_id,
        "version": version,
        "coefficients": coefficients.tolist(),
        "intercept": float(intercept),
        "features": FEATURE_CONFIG,
        "trainingSize": training_size,
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
    }
    MODEL_JSON_PATH.write_text(json.dumps(model_json, indent=2))

    print(f"Model v{version} saved (id: {model_id})")
    print(f"  Training size: {training_size}")
    print(f"  Accuracy: {accuracy:.3f}")
    print(f"  Precision: {precision:.3f}")
    print(f"  Recall: {recall:.3f}")
    print(f"  Coefficients: {coefficients.tolist()}")
    print(f"  Intercept: {float(intercept):.4f}")
    print(f"  Exported to: {MODEL_JSON_PATH}")

    return model_id


def seed():
    """Generate cold-start model from synthetic lending data."""
    print("Generating synthetic training data...")
    np.random.seed(42)
    n_samples = 2000

    # Generate features based on typical lending distributions
    income_ratio = np.random.lognormal(mean=0.7, sigma=0.5, size=n_samples)
    balance_ratio = np.random.lognormal(mean=0.0, sigma=0.6, size=n_samples)
    platform_risk = np.random.beta(2, 3, size=n_samples)  # skews lower
    loan_term = np.random.uniform(3, 18, size=n_samples)
    doc_score = np.random.beta(5, 2, size=n_samples)  # skews higher
    history = np.random.beta(3, 2, size=n_samples)  # slightly above 0.5
    exposure = np.random.exponential(0.3, size=n_samples)

    # Normalize
    X = np.column_stack([
        np.clip(income_ratio, 0, 5) / 5,
        np.clip(balance_ratio, 0, 2) / 2,
        platform_risk,
        loan_term / 18,
        doc_score,
        history,
        np.clip(exposure, 0, 3) / 3,
    ])

    # Generate default labels based on realistic relationships
    # Higher income ratio, balance, docs, history → less likely to default
    # Higher platform risk, loan term, exposure → more likely to default
    z = (
        -2.0  # intercept (base default rate ~12%)
        - 1.5 * X[:, 0]  # income ratio (protective)
        - 0.8 * X[:, 1]  # balance ratio (protective)
        + 1.2 * X[:, 2]  # platform risk (risk factor)
        + 0.6 * X[:, 3]  # loan term (risk factor)
        - 0.5 * X[:, 4]  # doc score (protective)
        - 1.0 * X[:, 5]  # history (protective)
        + 0.9 * X[:, 6]  # exposure (risk factor)
    )
    prob = 1 / (1 + np.exp(-z))
    y = (np.random.random(n_samples) < prob).astype(int)

    print(f"Default rate in synthetic data: {y.mean():.1%}")

    # Train
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = LogisticRegression(class_weight="balanced", random_state=42, max_iter=1000)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)

    print(f"\nSeed model performance:")
    print(f"  Accuracy:  {acc:.3f}")
    print(f"  Precision: {prec:.3f}")
    print(f"  Recall:    {rec:.3f}")

    conn = get_db()
    save_model(conn, model.coef_[0], model.intercept_[0], n_samples, acc, prec, rec)
    conn.close()

    print("\nSeed complete. Run the app and the model will be used for scoring.")


def retrain():
    """Retrain model from real loan outcome data."""
    conn = get_db()

    # Check minimum data requirement
    cursor = conn.execute("SELECT value FROM LoanRule WHERE key = 'retrain_min_data'")
    row = cursor.fetchone()
    min_data = int(row[0]) if row else 30

    # Load risk profiles with application data
    df = pd.read_sql_query(
        """
        SELECT rp.outcome, rp.latePaymentCount, rp.loanTermMonths,
               rp.monthlyIncome, rp.loanAmount, rp.ssnHash,
               a.bankBalance, a.platform
        FROM RiskProfile rp
        JOIN Application a ON a.id = rp.applicationId
        WHERE rp.outcome IN ('PAID_OFF', 'DEFAULTED')
        """,
        conn,
    )

    if len(df) < min_data:
        print(f"Insufficient data: {len(df)} profiles, need {min_data}. Skipping retrain.")
        conn.close()
        sys.exit(0)

    print(f"Training on {len(df)} loan outcomes...")

    # Build feature matrix
    features = []
    labels = []

    for _, row in df.iterrows():
        loan_amount = float(row["loanAmount"])
        monthly_income = float(row["monthlyIncome"]) if row["monthlyIncome"] else None
        bank_balance = float(row["bankBalance"]) if row["bankBalance"] else None
        platform = row["platform"]
        term = int(row["loanTermMonths"]) if row["loanTermMonths"] else 12
        late_count = int(row["latePaymentCount"])

        # Get document count from application (approximate with required_pay_stubs)
        doc_score = 1.0  # funded loans had enough docs

        # Repayment history from OTHER loans by same borrower
        ssn_hash = row["ssnHash"]
        hist_cursor = conn.execute(
            "SELECT latePaymentCount, outcome, loanTermMonths FROM RiskProfile WHERE ssnHash = ? AND applicationId != (SELECT id FROM Application WHERE ssnHash = ? LIMIT 1)",
            (ssn_hash, ssn_hash),
        )
        hist_rows = hist_cursor.fetchall()
        if hist_rows:
            total_late = sum(r[0] for r in hist_rows)
            total_terms = sum(r[2] or 12 for r in hist_rows)
            any_default = any(r[1] == "DEFAULTED" for r in hist_rows)
            history_score = (1 - (total_late / total_terms if total_terms > 0 else 0)) * (0.5 if any_default else 1.0)
        else:
            history_score = 0.5

        # Aggregate exposure (0 for completed loans — they're done)
        exposure = 0.0

        income_ratio = (monthly_income * term / loan_amount) if monthly_income else 2.5
        balance_ratio = (bank_balance / loan_amount) if bank_balance else 1.0
        platform_risk = PLATFORM_RISK.get(platform.lower() if platform else "", 0.5)

        feature_vec = [
            normalize(income_ratio, 5.0, 5.0),
            normalize(balance_ratio, 2.0, 2.0),
            platform_risk,
            normalize(term, 18, 18),
            doc_score,
            history_score,
            normalize(exposure, 3.0, 3.0),
        ]

        features.append(feature_vec)
        labels.append(1 if row["outcome"] == "DEFAULTED" else 0)

    X = np.array(features)
    y = np.array(labels)

    print(f"Default rate: {y.mean():.1%}")

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = LogisticRegression(class_weight="balanced", random_state=42, max_iter=1000)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)

    print(f"\nRetrained model performance:")
    print(f"  Accuracy:  {acc:.3f}")
    print(f"  Precision: {prec:.3f}")
    print(f"  Recall:    {rec:.3f}")

    # Check accuracy threshold
    if acc < 0.6:
        print(f"\nWARNING: Accuracy {acc:.3f} < 0.60 threshold. NOT deploying new model.")
        conn.close()
        sys.exit(0)

    save_model(conn, model.coef_[0], model.intercept_[0], len(df), acc, prec, rec)
    conn.close()

    print("\nRetrain complete. New model is now active.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train risk scoring model")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--seed", action="store_true", help="Generate cold-start model from synthetic data")
    group.add_argument("--retrain", action="store_true", help="Retrain from real loan outcomes")
    args = parser.parse_args()

    if args.seed:
        seed()
    else:
        retrain()
```

- [ ] **Step 3: Install Python deps and test seed**

Run:
```bash
pip3 install -r scripts/requirements.txt
python3 scripts/train_risk_model.py --seed
```

Expected: Model v1 saved with ~75%+ accuracy. `risk-model.json` created in project root.

- [ ] **Step 4: Verify model was saved to DB**

Run: `sqlite3 prisma/dev.db "SELECT id, version, accuracy, isActive FROM RiskModel"`
Expected: One row with version=1, isActive=1.

- [ ] **Step 5: Commit**

```bash
git add scripts/ risk-model.json
git commit -m "feat: add Python risk model training script with cold-start seed"
```

---

## Chunk 2: Integration — Rules Engine, Applications, Plaid

### Task 7: Relax SSN Duplicate Check

**Files:**
- Modify: `src/actions/applications.ts`
- Modify: `src/lib/rules-engine.ts`

- [ ] **Step 1: Update submitApplication SSN check**

In `src/actions/applications.ts`, find the duplicate SSN check (around line 66-71). Replace it to only block PENDING or APPROVED duplicates:

Find:
```typescript
  if (ssnHash) {
    const existing = await prisma.application.findFirst({ where: { ssnHash } });
    if (existing) {
      return { success: false, error: "An application with this SSN already exists." };
    }
  }
```

Replace with:
```typescript
  if (ssnHash) {
    const existing = await prisma.application.findFirst({
      where: { ssnHash, status: { in: ["PENDING", "APPROVED"] } },
    });
    if (existing) {
      return { success: false, error: "An application with this SSN is already in progress." };
    }
  }
```

- [ ] **Step 2: Update evaluateApplication SSN check**

In `src/lib/rules-engine.ts`, find the duplicate SSN check (lines 83-95). Replace the status filter:

Find:
```typescript
  if (application.ssnHash) {
    const duplicates = await prisma.application.count({
      where: {
        ssnHash: application.ssnHash,
        id: { not: application.id },
        status: { notIn: ["REJECTED"] },
      },
    });
    if (duplicates > 0) {
      recommendation = "REJECT";
      reasons.push("Duplicate SSN found in system");
    }
  }
```

Replace with:
```typescript
  if (application.ssnHash) {
    const duplicates = await prisma.application.count({
      where: {
        ssnHash: application.ssnHash,
        id: { not: application.id },
        status: { in: ["PENDING", "APPROVED"] },
      },
    });
    if (duplicates > 0) {
      recommendation = "REJECT";
      reasons.push("Another application with this SSN is already in progress");
    }
  }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 4: Commit**

```bash
git add src/actions/applications.ts src/lib/rules-engine.ts
git commit -m "feat: allow repeat borrowers — only block PENDING/APPROVED SSN duplicates"
```

---

### Task 8: Integrate Risk Model into Rules Engine

**Files:**
- Modify: `src/lib/rules-engine.ts`

- [ ] **Step 1: Replace hardcoded rate with model scoring**

In `src/lib/rules-engine.ts`, import the scoring function at the top:

```typescript
import { scoreApplication } from "@/lib/risk-model";
```

Find where `suggestedRate` is set (the line that assigns it to `min_interest_rate` or the rule value). Replace with a call to the model:

At the end of `evaluateApplication()`, before the return statement, replace the `suggestedRate` assignment. The function needs the application ID, so the function signature must accept it. Update:

Change the function signature from:
```typescript
export async function evaluateApplication(application: ApplicationWithDocuments)
```
to:
```typescript
export async function evaluateApplication(application: ApplicationWithDocuments & { id: string })
```

Then replace the `suggestedRate` calculation with:

```typescript
  // Score via risk model (or fallback to min rate)
  let suggestedRate = parseFloat(ruleMap.min_interest_rate ?? "30");
  let riskScoreResult = null;
  try {
    riskScoreResult = await scoreApplication(application.id);
    suggestedRate = riskScoreResult.interestRate;
  } catch (error) {
    console.warn("Risk model scoring failed, using min_interest_rate:", error);
  }
```

Update the return to include the risk score result:

```typescript
  return {
    recommendation,
    reasons,
    suggestedRate,
    rules,
    riskScore: riskScoreResult,
  };
```

- [ ] **Step 2: Update EvaluationResult type in both locations**

The `EvaluationResult` type is defined in two places. Update **both**:

In `src/types/index.ts`, update the `EvaluationResult` interface:

```typescript
export interface EvaluationResult {
  recommendation: "APPROVE" | "REJECT" | "MANUAL_REVIEW";
  reasons: string[];
  suggestedRate: number;
  rules: Record<string, string>;
  riskScore: RiskScoreResult | null;
}
```

In `src/lib/rules-engine.ts`, update the local `EvaluationResult` interface (lines 6-11) to match:

```typescript
export interface EvaluationResult {
  recommendation: ApprovalRecommendation;
  reasons: string[];
  suggestedRate: number;
  rules: Record<string, string>;
  riskScore: RiskScoreResult | null;
}
```

Add the import at the top of `rules-engine.ts`:

```typescript
import type { RiskScoreResult } from "@/types";
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build passes. Any callers of `evaluateApplication` already pass full application objects with `id`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rules-engine.ts src/types/index.ts
git commit -m "feat: integrate risk model scoring into rules engine evaluation"
```

---

### Task 9: Auto-Set Rate on Approval

**Files:**
- Modify: `src/actions/applications.ts`

- [ ] **Step 1: Update approveApplication to auto-set rate from model**

In `src/actions/applications.ts`, modify `approveApplication()`. Remove the `interestRate` parameter and compute it internally:

Find the function signature (around line 159):
```typescript
export async function approveApplication(
  applicationId: string,
  interestRate: number,
  loanTermMonths?: number
)
```

Replace with:
```typescript
export async function approveApplication(
  applicationId: string,
  loanTermMonths?: number
)
```

Inside the function, after loading the application and checking evaluation, add:

```typescript
  // Score application with risk model
  const { scoreApplication } = await import("@/lib/risk-model");
  const scoring = await scoreApplication(applicationId);
  const interestRate = scoring.interestRate;
```

Also update the application update to store riskScore and riskModelId:

Find the `prisma.application.update` call and add to the `data`:

```typescript
      data: {
        status: "APPROVED",
        interestRate,
        loanTermMonths: loanTermMonths ?? application.loanTermMonths,
        approvedBy: session.user.email,
        approvedAt: new Date(),
        riskScore: scoring.riskScore,
        riskModelId: scoring.modelId,
      },
```

- [ ] **Step 2: Update admin UI caller**

In `src/app/admin/applications/[id]/detail-client.tsx`, find where `approveApplication` is called (in the approve handler). It currently passes `interestRate` as a parameter. Remove that argument — only pass `applicationId` and optionally `loanTermMonths`:

Find:
```typescript
const result = await approveApplication(application.id, rate, term);
```

Replace with:
```typescript
const result = await approveApplication(application.id, term || undefined);
```

Also remove the `interestRate` state variable and input field from the approval section.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 4: Commit**

```bash
git add src/actions/applications.ts src/app/admin/applications/[id]/detail-client.tsx
git commit -m "feat: auto-set interest rate from risk model on approval"
```

---

### Task 10: Plaid Balance Integration

**Files:**
- Modify: `src/actions/plaid.ts`

- [ ] **Step 1: Add balance fetch after income fetch**

In `src/actions/plaid.ts`, modify `fetchAndStoreIncome()` to also fetch and store the bank balance. After the income calculation and update (around line 36-39), add:

```typescript
    // Fetch and store bank balance
    try {
      const balanceResponse = await plaidClient.accountsBalanceGet({
        access_token: accessToken,
      });
      const account = balanceResponse.data.accounts.find(
        (a) => a.account_id === application.plaidAccountId
      );
      if (account?.balances?.current != null) {
        await prisma.application.update({
          where: { id: applicationId },
          data: { bankBalance: account.balances.current },
        });
      }
    } catch (balanceError) {
      console.warn("Failed to fetch bank balance:", balanceError);
      // Non-fatal: income was already stored, balance is optional
    }
```

Add the plaidClient import if not already present:

```typescript
import { plaidClient } from "@/lib/plaid";
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add src/actions/plaid.ts
git commit -m "feat: fetch and store Plaid bank balance for risk scoring"
```

---

## Chunk 3: Cron Jobs — RiskProfile Population & Retraining

### Task 11: RiskProfile on PAID_OFF + Retrain Trigger

**Files:**
- Modify: `src/app/api/cron/payment-status/route.ts`

- [ ] **Step 1: Add RiskProfile creation and retrain check on PAID_OFF**

In `src/app/api/cron/payment-status/route.ts`, find the section where a loan is marked PAID_OFF (around lines 57-62). After the status update, add RiskProfile creation and retrain trigger:

```typescript
        // Create RiskProfile for training data
        const allPayments = await prisma.payment.findMany({
          where: { applicationId: payment.applicationId },
        });
        const totalPaid = allPayments
          .filter((p) => p.status === "PAID")
          .reduce((sum, p) => sum + Number(p.amount) + Number(p.lateFee), 0);
        const totalOwed = allPayments
          .reduce((sum, p) => sum + Number(p.amount), 0);
        const latePaymentCount = allPayments
          .filter((p) => Number(p.lateFee) > 0).length;

        const app = await prisma.application.findUnique({
          where: { id: payment.applicationId },
        });

        if (app?.ssnHash) {
          await prisma.riskProfile.create({
            data: {
              applicationId: payment.applicationId,
              ssnHash: app.ssnHash,
              platform: app.platform ?? "unknown",
              monthlyIncome: app.monthlyIncome ?? 0,
              loanAmount: app.loanAmount,
              loanTermMonths: app.loanTermMonths ?? 12,
              interestRate: app.interestRate ?? 0,
              outcome: "PAID_OFF",
              totalPaid,
              totalOwed,
              latePaymentCount,
              completedAt: new Date(),
            },
          });

          // Check retrain threshold
          const { checkAndTriggerRetrain } = await import("@/lib/risk-model");
          await checkAndTriggerRetrain();
        }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/payment-status/route.ts
git commit -m "feat: create RiskProfile on PAID_OFF and trigger retrain check"
```

---

### Task 12: DEFAULTED Escalation + RiskProfile in Collections Cron

**Files:**
- Modify: `src/app/api/cron/collections/route.ts`

- [ ] **Step 1: Add COLLECTIONS to the status query**

In `src/app/api/cron/collections/route.ts`, find the main query that fetches applications (the `prisma.application.findMany` call). Update the status filter to include `"COLLECTIONS"`:

Find:
```typescript
    status: { in: ["ACTIVE", "LATE"] },
```

Replace with:
```typescript
    status: { in: ["ACTIVE", "LATE", "COLLECTIONS"] },
```

- [ ] **Step 2: Add DEFAULTED escalation logic**

After the existing 30-day COLLECTIONS escalation block, add the DEFAULTED escalation. Find a good insertion point (after the 7-day warning block, or at the beginning of the per-application loop). Add:

```typescript
      // DEFAULTED escalation: COLLECTIONS for 90+ days
      if (app.status === "COLLECTIONS") {
        const defaultThreshold = parseInt(ruleMap.default_threshold_days ?? "90");
        const collectionsEvent = await prisma.collectionEvent.findFirst({
          where: {
            applicationId: app.id,
            eventType: "ESCALATED",
          },
          orderBy: { createdAt: "desc" },
        });

        if (collectionsEvent) {
          const daysSinceEscalation = Math.floor(
            (now.getTime() - collectionsEvent.createdAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysSinceEscalation >= defaultThreshold) {
            await prisma.application.update({
              where: { id: app.id },
              data: { status: "DEFAULTED" },
            });

            // Create RiskProfile
            const allPayments = await prisma.payment.findMany({
              where: { applicationId: app.id },
            });
            const totalPaid = allPayments
              .filter((p) => p.status === "PAID")
              .reduce((sum, p) => sum + Number(p.amount) + Number(p.lateFee), 0);
            const totalOwed = allPayments
              .reduce((sum, p) => sum + Number(p.amount), 0);
            const latePaymentCount = allPayments
              .filter((p) => Number(p.lateFee) > 0).length;

            if (app.ssnHash) {
              await prisma.riskProfile.create({
                data: {
                  applicationId: app.id,
                  ssnHash: app.ssnHash,
                  platform: app.platform ?? "unknown",
                  monthlyIncome: app.monthlyIncome ?? 0,
                  loanAmount: app.loanAmount,
                  loanTermMonths: app.loanTermMonths ?? 12,
                  interestRate: app.interestRate ?? 0,
                  outcome: "DEFAULTED",
                  totalPaid,
                  totalOwed,
                  latePaymentCount,
                  defaultedAt: new Date(),
                },
              });

              // Check retrain threshold
              const { checkAndTriggerRetrain } = await import("@/lib/risk-model");
              await checkAndTriggerRetrain();
            }

            await logAudit({
              action: "COLLECTIONS_ESCALATION",
              entityType: "APPLICATION",
              entityId: app.id,
              performedBy: "system:collections",
              details: { escalatedTo: "DEFAULTED", daysSinceCollections: daysSinceEscalation },
            });
          }
        }
        continue; // COLLECTIONS apps don't need warning checks
      }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/collections/route.ts
git commit -m "feat: add DEFAULTED escalation and RiskProfile creation in collections cron"
```

---

## Chunk 4: Admin UI — Risk Display & Settings

### Task 13: Admin Detail Page — Risk Score Display

**Files:**
- Modify: `src/app/admin/applications/[id]/detail-client.tsx`

- [ ] **Step 1: Replace ad-hoc risk display with model-driven UI**

In `src/app/admin/applications/[id]/detail-client.tsx`:

1. Add state for risk score result:

```typescript
const [riskResult, setRiskResult] = useState<RiskScoreResult | null>(null);
```

2. When evaluation loads, extract the risk score:

In the evaluation loading effect/handler, after setting the evaluation result, add:

```typescript
if (evalResult.riskScore) {
  setRiskResult(evalResult.riskScore);
}
```

3. Replace the existing risk assessment section (the one with hardcoded Low/Medium/High tiers around lines 662-703) with a model-driven display:

```tsx
{/* Risk Score from Model */}
{riskResult && (
  <Card>
    <CardHeader>
      <CardTitle>Risk Assessment</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      {/* Score + Rate header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4 text-center">
          <p className="text-sm text-muted-foreground">Risk Score</p>
          <p className={`text-3xl font-bold ${
            riskResult.riskScore < 33 ? "text-emerald-600" :
            riskResult.riskScore < 66 ? "text-amber-600" :
            "text-red-600"
          }`}>
            {riskResult.riskScore.toFixed(1)}
          </p>
          <p className="text-xs text-muted-foreground">out of 100 (higher = riskier)</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-sm text-muted-foreground">Calculated Rate</p>
          <p className="text-3xl font-bold">{riskResult.interestRate.toFixed(2)}%</p>
          <p className="text-xs text-muted-foreground">auto-set on approval</p>
        </div>
      </div>

      {/* Feature Breakdown */}
      <div>
        <h4 className="text-sm font-medium mb-2">Feature Breakdown</h4>
        <div className="rounded border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2">Feature</th>
                <th className="text-right p-2">Raw Value</th>
                <th className="text-right p-2">Normalized</th>
                <th className="text-right p-2">Weight</th>
              </tr>
            </thead>
            <tbody>
              {riskResult.features.map((f) => (
                <tr key={f.name} className="border-b last:border-0">
                  <td className="p-2 font-mono text-xs">{f.name}</td>
                  <td className="p-2 text-right">{f.rawValue?.toFixed(2) ?? "N/A"}</td>
                  <td className="p-2 text-right">{f.normalizedValue.toFixed(3)}</td>
                  <td className={`p-2 text-right ${f.weight > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {f.weight.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!riskResult.modelId && (
        <p className="text-sm text-amber-600">
          No risk model loaded — using default rate. Run the seed script to initialize.
        </p>
      )}
    </CardContent>
  </Card>
)}
```

4. Remove the old interest rate input from the approval section. The rate will display in the risk assessment section instead.

5. Remove the 25% profit target calculator and the manual monthly payment input — these are replaced by the model-driven rate.

- [ ] **Step 2: Add borrower history and exposure sections**

After the feature breakdown table, add:

```tsx
{/* Repeat Borrower History */}
{/* This data comes from the evaluation — check if application has past loans */}

{/* Active Exposure */}
{riskResult.features.find(f => f.name === "aggregate_exposure")?.rawValue != null &&
  riskResult.features.find(f => f.name === "aggregate_exposure")!.rawValue! > 0 && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
    <p className="text-sm font-medium text-amber-800">
      Concurrent Loans Detected
    </p>
    <p className="text-sm text-amber-700">
      Exposure ratio: {riskResult.features.find(f => f.name === "aggregate_exposure")?.rawValue?.toFixed(2)}
      (outstanding balance / quarterly income)
    </p>
  </div>
)}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/applications/[id]/detail-client.tsx
git commit -m "feat: replace ad-hoc risk display with model-driven scoring UI"
```

---

### Task 14: Settings Page — Model Info Panel

**Files:**
- Modify: `src/app/admin/settings/settings-client.tsx`

- [ ] **Step 1: Add model info display**

In `src/app/admin/settings/settings-client.tsx`, add a server action to get the active model info. First, create a new action or inline query. The simplest approach: add a section that fetches and displays model info.

Add a state and effect for model info:

```tsx
const [modelInfo, setModelInfo] = useState<{
  version: number;
  accuracy: number;
  precision: number;
  recall: number;
  trainingSize: number;
  createdAt: string;
} | null>(null);

useEffect(() => {
  fetch("/api/risk-model-info")
    .then((r) => r.json())
    .then((data) => setModelInfo(data.model ?? null))
    .catch(() => setModelInfo(null));
}, []);
```

Add the Model Info card at the top of the settings page, before the rules grid:

```tsx
<Card className="mb-6">
  <CardHeader>
    <CardTitle>Risk Model</CardTitle>
  </CardHeader>
  <CardContent>
    {modelInfo ? (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Version</p>
          <p className="font-medium">v{modelInfo.version}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Training Date</p>
          <p className="font-medium">{new Date(modelInfo.createdAt).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Sample Size</p>
          <p className="font-medium">{modelInfo.trainingSize}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Accuracy</p>
          <p className="font-medium">{(modelInfo.accuracy * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">Precision</p>
          <p className="font-medium">{(modelInfo.precision * 100).toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground">Recall</p>
          <p className="font-medium">{(modelInfo.recall * 100).toFixed(1)}%</p>
        </div>
      </div>
    ) : (
      <p className="text-sm text-amber-600">
        No risk model loaded. Run: <code className="bg-muted px-1 rounded">python3 scripts/train_risk_model.py --seed</code>
      </p>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 2: Create model info API route**

Create `src/app/api/risk-model-info/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const model = await prisma.riskModel.findFirst({
    where: { isActive: true },
    select: {
      version: true,
      accuracy: true,
      precision: true,
      recall: true,
      trainingSize: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ model });
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/settings/settings-client.tsx src/app/api/risk-model-info/route.ts
git commit -m "feat: add risk model info panel to admin settings page"
```

---

### Task 15: Update Borrower Status Display

**Files:**
- Modify: `src/components/status-display.tsx`

- [ ] **Step 1: Add DEFAULTED status badge**

In `src/components/status-display.tsx`, verify the status badge handles DEFAULTED. Check the `StatusBadge` component (around lines 29-45). It should already have DEFAULTED — if not, add:

```typescript
case "DEFAULTED":
  return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">DEFAULTED</span>;
```

This is likely already present from Phase 2, but verify.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build passes.

- [ ] **Step 3: Commit (only if changes were needed)**

```bash
git add src/components/status-display.tsx
git commit -m "feat: ensure DEFAULTED status badge in borrower status display"
```

---

### Task 16: Build & Verify Phase 3

**Files:** All modified files

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build passes with no errors.

- [ ] **Step 2: Verify seed model exists**

Run: `sqlite3 prisma/dev.db "SELECT version, accuracy, isActive FROM RiskModel WHERE isActive = 1"`
Expected: One row with the seed model.

- [ ] **Step 3: Verify new LoanRules exist**

Run: `sqlite3 prisma/dev.db "SELECT key, value FROM LoanRule WHERE key IN ('max_interest_rate', 'retrain_threshold', 'retrain_min_data', 'default_threshold_days', 'completed_since_last_train')"`
Expected: Five rows with correct defaults.

- [ ] **Step 4: Verify schema changes**

Run: `sqlite3 prisma/dev.db ".schema Application" | grep -E "bankBalance|riskModelId"`
Expected: Both columns present.

Run: `sqlite3 prisma/dev.db ".schema RiskProfile" | grep ssnHash`
Expected: ssnHash column present.

- [ ] **Step 5: Commit any remaining fixes**

If any build fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: resolve Phase 3 build issues"
```
