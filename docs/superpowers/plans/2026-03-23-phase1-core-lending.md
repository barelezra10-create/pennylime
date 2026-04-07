# Phase 1: Core Lending Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the loan portal from a basic application intake tool into a full lending infrastructure with Plaid bank verification, encrypted SSN storage, rule-based approval engine, audit trail, and email notifications.

**Architecture:** Server actions handle all mutations. Plaid Link runs client-side in the application form, with server-side token exchange and income verification. SSN is AES-256-GCM encrypted before storage with a SHA-256 hash for dedup. Resend sends transactional emails via React Email templates. Every admin action is logged to an immutable AuditLog table.

**Tech Stack:** Next.js 16 (App Router), Prisma + SQLite, Plaid (plaid-node), Resend + React Email, AES-256-GCM encryption, NextAuth, Zod, Tailwind v4 + shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-23-loan-portal-design.md`

---

## Chunk 1: Schema, Encryption, and Plaid Foundation

### Task 1: Expand Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.mts`

- [ ] **Step 1: Update Application model with new fields**

Add these fields to the `Application` model in `prisma/schema.prisma`:

```prisma
model Application {
  id              String    @id @default(uuid())
  applicationCode String    @unique
  firstName       String
  lastName        String
  email           String
  phone           String
  loanAmount      Decimal
  loanTermMonths  Int       @default(6)
  platform        String?
  ssnEncrypted    String?
  ssnHash         String?
  plaidAccessToken String?
  plaidAccountId  String?
  plaidItemId     String?
  plaidLinkStale  Boolean   @default(false)
  monthlyIncome   Decimal?
  totalIncome     Decimal?
  riskScore       Decimal?
  interestRate    Decimal?
  approvedBy      String?
  approvedAt      DateTime?
  fundedAt        DateTime?
  fundedAmount    Decimal?
  rejectionReason String?
  status          String    @default("PENDING")
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  documents       Document[]
  payments        Payment[]
  collectionEvents CollectionEvent[]

  @@index([status])
  @@index([email])
  @@index([ssnHash])
  @@index([plaidItemId])
}
```

- [ ] **Step 2: Add Payment model**

```prisma
model Payment {
  id              String    @id @default(uuid())
  applicationId   String
  amount          Decimal
  principal       Decimal
  interest        Decimal
  lateFee         Decimal   @default(0)
  dueDate         DateTime
  paidAt          DateTime?
  status          String    @default("PENDING")
  paymentNumber   Int
  achTransferId   String?
  retryCount      Int       @default(0)
  lastRetryAt     DateTime?
  createdAt       DateTime  @default(now())
  application     Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
  @@index([status])
  @@index([dueDate])
}
```

- [ ] **Step 3: Add AuditLog model**

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  action      String
  entityType  String
  entityId    String
  performedBy String
  details     String?
  createdAt   DateTime @default(now())

  @@index([entityType, entityId])
  @@index([performedBy])
  @@index([createdAt])
}
```

- [ ] **Step 4: Add RiskProfile model**

```prisma
model RiskProfile {
  id               String    @id @default(uuid())
  applicationId    String
  platform         String
  monthlyIncome    Decimal
  loanAmount       Decimal
  loanTermMonths   Int
  interestRate     Decimal
  outcome          String
  totalPaid        Decimal
  totalOwed        Decimal
  latePaymentCount Int       @default(0)
  defaultedAt      DateTime?
  completedAt      DateTime?
  createdAt        DateTime  @default(now())

  @@index([platform])
  @@index([outcome])
}
```

- [ ] **Step 5: Add CollectionEvent model**

```prisma
model CollectionEvent {
  id            String   @id @default(uuid())
  applicationId String
  eventType     String
  performedBy   String?
  notes         String?
  createdAt     DateTime @default(now())
  application   Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
}
```

- [ ] **Step 6: Add new seed data for new loan rules**

In `prisma/seed.mts`, add these rules to the `upsert` loop:

```typescript
{ key: "min_loan", value: "100", description: "Minimum loan amount in dollars" },
{ key: "min_bank_balance", value: "200", description: "Minimum bank balance at time of application" },
{ key: "max_loan_term_months", value: "18", description: "Maximum repayment period in months" },
{ key: "min_interest_rate", value: "30", description: "Floor interest rate (annual %)" },
{ key: "late_fee_amount", value: "25", description: "Flat late fee per missed payment in dollars" },
{ key: "late_fee_grace_days", value: "3", description: "Days after due date before late fee applies" },
{ key: "collections_threshold_days", value: "30", description: "Days overdue before collections escalation" },
```

- [ ] **Step 7: Run migration**

```bash
cd /Users/baralezrah/loan-portal
npx prisma migrate dev --name expand-schema-phase1
```

Expected: Migration creates successfully, new tables and columns added.

- [ ] **Step 8: Run seed**

```bash
npx prisma db seed
```

Expected: New loan rules seeded without errors.

- [ ] **Step 9: Regenerate Prisma client and verify**

```bash
npx prisma generate
```

Then verify the build works:

```bash
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 10: Commit**

```bash
git add prisma/ src/generated/
git commit -m "feat: expand schema with Payment, AuditLog, RiskProfile, CollectionEvent models and new Application fields"
```

---

### Task 2: Encryption Utility

**Files:**
- Create: `src/lib/encryption.ts`

- [ ] **Step 1: Create encryption utility**

Create `src/lib/encryption.ts`:

```typescript
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is required");
  return Buffer.from(key, "hex");
}

function getHashSalt(): string {
  const salt = process.env.SSN_HASH_SALT;
  if (!salt) throw new Error("SSN_HASH_SALT environment variable is required");
  return salt;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertext] = encryptedData.split(":");

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function hashSSN(ssn: string): string {
  const salt = getHashSalt();
  const normalized = ssn.replace(/\D/g, "");
  return createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
}
```

- [ ] **Step 2: Add env vars to .env**

Add to `.env` (generate a 32-byte hex key):

```bash
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<generated-32-byte-hex-key>
SSN_HASH_SALT=<random-string>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/encryption.ts
git commit -m "feat: add AES-256-GCM encryption and SSN hashing utilities"
```

---

### Task 3: Audit Log Service

**Files:**
- Create: `src/lib/audit.ts`

- [ ] **Step 1: Create audit log service**

Create `src/lib/audit.ts`:

```typescript
import { prisma } from "@/lib/db";

export type AuditAction =
  | "APPROVE"
  | "REJECT"
  | "FUND"
  | "EDIT_INCOME"
  | "VIEW_SSN"
  | "CHANGE_SETTING"
  | "LOGIN"
  | "WAIVE_FEE";

export type AuditEntityType =
  | "APPLICATION"
  | "PAYMENT"
  | "LOAN_RULE";

export async function logAudit(params: {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  performedBy: string;
  details?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      performedBy: params.performedBy,
      details: params.details ? JSON.stringify(params.details) : null,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/audit.ts
git commit -m "feat: add audit log service"
```

---

### Task 4: Install Plaid and Resend Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd /Users/baralezrah/loan-portal
npm install plaid resend @react-email/components react-email
```

- [ ] **Step 2: Add Plaid env vars to .env**

```bash
PLAID_CLIENT_ID=<your-client-id>
PLAID_SECRET=<your-secret>
PLAID_ENV=sandbox
PLAID_WEBHOOK_URL=http://localhost:3000/api/plaid/webhook

RESEND_API_KEY=<your-api-key>
RESEND_FROM_EMAIL=noreply@yourdomain.com
APP_URL=http://localhost:3000
```

- [ ] **Step 3: Create Plaid client**

Create `src/lib/plaid.ts`:

```typescript
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
```

- [ ] **Step 4: Create Resend client**

Create `src/lib/email.ts`:

```typescript
import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@example.com";
export const APP_URL = process.env.APP_URL || "http://localhost:3000";
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/plaid.ts src/lib/email.ts
git commit -m "feat: add Plaid and Resend client setup"
```

---

### Task 5: Plaid API Routes

**Files:**
- Create: `src/app/api/plaid/create-link-token/route.ts`
- Create: `src/app/api/plaid/exchange-token/route.ts`
- Create: `src/app/api/plaid/webhook/route.ts`

- [ ] **Step 1: Create link token route**

Create `src/app/api/plaid/create-link-token/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { CountryCode, Products } from "plaid";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { applicationId } = body;

    if (!applicationId) {
      return NextResponse.json({ error: "applicationId required" }, { status: 400 });
    }

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: applicationId },
      client_name: "1099 Loan Portal",
      products: [Products.Auth, Products.Identity, Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL,
    });

    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (error) {
    console.error("Plaid link token error:", error);
    return NextResponse.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create exchange token route**

Create `src/app/api/plaid/exchange-token/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { encrypt } from "@/lib/encryption";

export async function POST(req: NextRequest) {
  try {
    const { publicToken } = await req.json();

    if (!publicToken) {
      return NextResponse.json({ error: "publicToken required" }, { status: 400 });
    }

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Get auth to retrieve account info
    const authResponse = await plaidClient.authGet({ access_token: accessToken });
    const account = authResponse.data.accounts[0];

    // Encrypt access token before returning
    const encryptedToken = encrypt(accessToken);

    return NextResponse.json({
      accessToken: encryptedToken,
      itemId,
      accountId: account?.account_id || null,
    });
  } catch (error) {
    console.error("Plaid exchange error:", error);
    return NextResponse.json({ error: "Failed to exchange token" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create webhook route**

Create `src/app/api/plaid/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { webhook_type, webhook_code, item_id } = body;

    console.log(`Plaid webhook: ${webhook_type}/${webhook_code} for item ${item_id}`);

    if (webhook_type === "ITEM" && ["PENDING_EXPIRATION", "ERROR", "LOGIN_REQUIRED"].includes(webhook_code)) {
      // Bank credentials expired or errored — mark as stale for re-link
      await prisma.application.updateMany({
        where: { plaidItemId: item_id },
        data: { plaidLinkStale: true },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Plaid webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/plaid/
git commit -m "feat: add Plaid API routes (link token, exchange, webhook)"
```

---

### Task 6: Update Application Form — Add Loan Term & Plaid Link

**Files:**
- Modify: `src/app/(public)/apply/page.tsx`

- [ ] **Step 1: Add loan term selector to Step 1 (StepAmount)**

In the `StepAmount` component, add a term selector below the loan amount slider:

```tsx
// Add state in the parent form component
const [loanTermMonths, setLoanTermMonths] = useState(6);

// In StepAmount, add after the loan amount section:
<div className="mt-8">
  <label className="block text-sm font-medium text-gray-700 mb-3">
    Repayment Term
  </label>
  <div className="grid grid-cols-3 gap-3">
    {[3, 6, 9, 12, 15, 18].map((months) => (
      <button
        key={months}
        type="button"
        onClick={() => setLoanTermMonths(months)}
        className={`py-3 rounded-xl text-sm font-medium transition-all ${
          loanTermMonths === months
            ? "bg-green-600 text-white shadow-lg"
            : "bg-white border border-gray-200 text-gray-700 hover:border-green-400"
        }`}
      >
        {months} months
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 2: Add Plaid Link step (new Step 5)**

Add Plaid Link as a new step between SSN (current step combined in StepInfo) and document upload. This requires:

1. Install the Plaid Link React hook:
```bash
npm install react-plaid-link
```

2. Create the Plaid Link step component within the apply page:

```tsx
function StepBankLink({
  onSuccess,
  applicationId,
}: {
  onSuccess: (data: { accessToken: string; itemId: string; accountId: string }) => void;
  applicationId: string;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    async function createToken() {
      try {
        const res = await fetch("/api/plaid/create-link-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId }),
        });
        const data = await res.json();
        setLinkToken(data.linkToken);
      } catch (err) {
        toast.error("Failed to initialize bank connection");
      } finally {
        setLoading(false);
      }
    }
    createToken();
  }, [applicationId]);

  const onPlaidSuccess = useCallback(
    async (publicToken: string) => {
      try {
        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken }),
        });
        const data = await res.json();
        onSuccess(data);
        setLinked(true);
        toast.success("Bank account linked successfully!");
      } catch (err) {
        toast.error("Failed to link bank account");
      }
    },
    [onSuccess]
  );

  // usePlaidLink from react-plaid-link
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken) => onPlaidSuccess(publicToken),
  });

  if (linked) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Bank Account Linked</h3>
        <p className="text-gray-500 mt-1">Your bank has been verified successfully.</p>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Building2 className="w-8 h-8 text-blue-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">Link Your Bank Account</h3>
      <p className="text-gray-500 mt-2 max-w-md mx-auto">
        We use Plaid to securely verify your income and set up payments. Your credentials are never shared with us.
      </p>
      <button
        onClick={() => open()}
        disabled={!ready || loading}
        className="mt-6 px-8 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
      >
        {loading ? "Initializing..." : "Connect Bank Account"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Update step array to include bank link as step 5**

The form steps become:
1. Loan Amount & Term
2. Personal Info (name, email, phone)
3. Gig Platform Selection
4. SSN Input
5. Bank Account Link (Plaid) — NEW
6. Document Upload (pay stubs)
7. Review & Submit

Update the `steps` array and step navigation logic accordingly. The step count changes from 6 to 7.

- [ ] **Step 4: Update form submission to include new fields**

Update the `handleSubmit` function to pass the new fields:

```tsx
const result = await submitApplication({
  firstName: formData.firstName,
  lastName: formData.lastName,
  email: formData.email,
  phone: formData.phone,
  loanAmount: formData.loanAmount,
  loanTermMonths: formData.loanTermMonths,
  platform: formData.platforms.join(", "),
  ssnRaw: formData.ssn, // Will be encrypted server-side
  plaidAccessToken: formData.plaidAccessToken,
  plaidAccountId: formData.plaidAccountId,
  plaidItemId: formData.plaidItemId,
  files: formData.uploadedFiles,
});
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\\(public\\)/apply/page.tsx package.json package-lock.json
git commit -m "feat: add loan term selector and Plaid bank linking to application form"
```

---

### Task 7: Update submitApplication Server Action

**Files:**
- Modify: `src/actions/applications.ts`

- [ ] **Step 1: Update Zod validation schema**

Update the schema in `src/actions/applications.ts`:

```typescript
const applicationSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(10),
  loanAmount: z.number().positive(),
  loanTermMonths: z.number().int().min(3).max(18),
  platform: z.string().optional(),
  ssnRaw: z.string().optional(),
  plaidAccessToken: z.string().optional(),
  plaidAccountId: z.string().optional(),
  plaidItemId: z.string().optional(),
  files: z.array(
    z.object({
      fileName: z.string(),
      mimeType: z.string(),
      fileSize: z.number(),
      storagePath: z.string(),
    })
  ),
});
```

- [ ] **Step 2: Update submitApplication to persist new fields**

In the `submitApplication` function, after validation:

```typescript
import { encrypt, hashSSN } from "@/lib/encryption";

// Inside submitApplication, after validation:
const ssnEncrypted = data.ssnRaw ? encrypt(data.ssnRaw) : null;
const ssnHash = data.ssnRaw ? hashSSN(data.ssnRaw) : null;

// Check for duplicate SSN
if (ssnHash) {
  const existing = await prisma.application.findFirst({
    where: { ssnHash },
  });
  if (existing) {
    return { success: false, error: "An application with this SSN already exists." };
  }
}

const applicationCode = uuidv4().substring(0, 8);

const application = await prisma.application.create({
  data: {
    applicationCode,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    loanAmount: data.loanAmount,
    loanTermMonths: data.loanTermMonths,
    platform: data.platform || null,
    ssnEncrypted,
    ssnHash,
    plaidAccessToken: data.plaidAccessToken || null,
    plaidAccountId: data.plaidAccountId || null,
    plaidItemId: data.plaidItemId || null,
    documents: {
      create: data.files.map((file) => ({
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        storagePath: file.storagePath,
      })),
    },
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/applications.ts
git commit -m "feat: persist platform, encrypted SSN, Plaid tokens, and loan term in submitApplication"
```

---

### Task 8: Fetch Plaid Income After Submission

**Files:**
- Create: `src/actions/plaid.ts`

- [ ] **Step 1: Create Plaid income action**

Create `src/actions/plaid.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { decrypt } from "@/lib/encryption";

export async function fetchAndStoreIncome(applicationId: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!application?.plaidAccessToken) {
    return { success: false, error: "No Plaid connection" };
  }

  try {
    const accessToken = decrypt(application.plaidAccessToken);

    // Use Transactions to estimate income (3-month deposit average)
    // This works with a standard access_token from item/public_token/exchange
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const txResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: threeMonthsAgo.toISOString().split("T")[0],
      end_date: now.toISOString().split("T")[0],
    });

    // Sum deposit transactions (Plaid: negative amount = money in)
    const deposits = txResponse.data.transactions
      .filter((tx) => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const monthlyIncome = deposits / 3;

    await prisma.application.update({
      where: { id: applicationId },
      data: { monthlyIncome },
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
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/plaid.ts
git commit -m "feat: add Plaid income verification with transactions fallback"
```

---

## Chunk 2: Approval Engine, Email, and Admin Enhancements

### Task 9: Enhanced Rules Engine

**Files:**
- Modify: `src/lib/rules-engine.ts`

- [ ] **Step 1: Rewrite rules engine with new approval logic**

Replace `src/lib/rules-engine.ts`:

```typescript
import { prisma } from "@/lib/db";
import type { ApplicationWithDocuments } from "@/types";

export type ApprovalRecommendation = "APPROVE" | "REJECT" | "MANUAL_REVIEW";

export interface EvaluationResult {
  recommendation: ApprovalRecommendation;
  reasons: string[];
  suggestedRate: number;
  rules: Record<string, string>;
}

export async function getLoanRules(): Promise<Record<string, string>> {
  const rules = await prisma.loanRule.findMany();
  return Object.fromEntries(rules.map((r) => [r.key, r.value]));
}

export async function evaluateApplication(
  application: ApplicationWithDocuments
): Promise<EvaluationResult> {
  const rules = await getLoanRules();
  const reasons: string[] = [];
  let recommendation: ApprovalRecommendation = "APPROVE";

  const loanAmount = Number(application.loanAmount);
  const loanLimit = Number(rules.loan_limit || "10000");
  const minLoan = Number(rules.min_loan || "100");
  const incomeMultiplier = Number(rules.income_multiplier_ratio || "2.0");
  const minBankBalance = Number(rules.min_bank_balance || "200");
  const requiredPayStubs = Number(rules.required_pay_stubs || "3");
  const minInterestRate = Number(rules.min_interest_rate || "30");

  const maxTermMonths = Number(rules.max_loan_term_months || "18");

  // Check loan amount limits
  if (loanAmount > loanLimit) {
    recommendation = "REJECT";
    reasons.push(`Loan amount $${loanAmount} exceeds limit of $${loanLimit}`);
  }
  if (loanAmount < minLoan) {
    recommendation = "REJECT";
    reasons.push(`Loan amount $${loanAmount} below minimum of $${minLoan}`);
  }

  // Check loan term
  if (loanTermMonths > maxTermMonths) {
    recommendation = "REJECT";
    reasons.push(`Loan term ${loanTermMonths} months exceeds maximum of ${maxTermMonths} months`);
  }

  // Check income verification
  const monthlyIncome = application.monthlyIncome ? Number(application.monthlyIncome) : null;
  const loanTermMonths = application.loanTermMonths || 6;

  if (!monthlyIncome) {
    if (recommendation !== "REJECT") recommendation = "MANUAL_REVIEW";
    reasons.push("Income not yet verified via Plaid");
  } else {
    const totalIncomeOverTerm = monthlyIncome * loanTermMonths;
    const requiredIncome = incomeMultiplier * loanAmount;
    if (totalIncomeOverTerm < requiredIncome) {
      recommendation = "REJECT";
      reasons.push(
        `Income over term ($${totalIncomeOverTerm.toFixed(0)}) < ${incomeMultiplier}x loan ($${requiredIncome.toFixed(0)})`
      );
    }
  }

  // Check documents
  if (application.documents.length < requiredPayStubs) {
    if (recommendation !== "REJECT") recommendation = "MANUAL_REVIEW";
    reasons.push(
      `Only ${application.documents.length} documents uploaded, ${requiredPayStubs} required`
    );
  }

  // Check Plaid bank connection
  if (!application.plaidAccessToken) {
    if (recommendation !== "REJECT") recommendation = "MANUAL_REVIEW";
    reasons.push("Bank account not linked via Plaid");
  }

  // Check duplicate SSN
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

  if (reasons.length === 0) {
    reasons.push("All checks passed");
  }

  return {
    recommendation,
    reasons,
    suggestedRate: minInterestRate,
    rules,
  };
}
```

- [ ] **Step 2: Update types to include new fields**

In `src/types/index.ts`, update `ApplicationWithDocuments`:

```typescript
import type { Application, Document, LoanRule } from "@/generated/prisma/client";

export type ApplicationWithDocuments = Application & { documents: Document[] };

export interface EvaluationResult {
  recommendation: "APPROVE" | "REJECT" | "MANUAL_REVIEW";
  reasons: string[];
  suggestedRate: number;
  rules: Record<string, string>;
}

export interface StorageProvider {
  upload(file: Buffer, filename: string): Promise<string>;
  getUrl(storagePath: string): string;
  delete(storagePath: string): Promise<void>;
}

// Re-export Prisma types used elsewhere
export type { LoanRule };
```

**IMPORTANT:** This replaces `EligibilityResult` and `DecisionEngine` from the old types. The existing `applications.ts` imports `decisionEngine` from `@/lib/rules-engine` — that import must be updated in the same commit (see step below).

- [ ] **Step 3: Update applications.ts to remove old rules engine import**

In `src/actions/applications.ts`, remove the import of `decisionEngine` and replace the `approveApplication` call to `decisionEngine.evaluate()` with a temporary pass-through (the full rewrite happens in Task 10). Replace:

```typescript
import { decisionEngine } from "@/lib/rules-engine";
```

with:

```typescript
import { evaluateApplication } from "@/lib/rules-engine";
```

And in the existing `approveApplication` function, replace the `decisionEngine.evaluate(...)` call with `evaluateApplication(application)`. This ensures the build does not break between Task 9 and Task 10.

- [ ] **Step 4: Commit**

```bash
git add src/lib/rules-engine.ts src/types/index.ts src/actions/applications.ts
git commit -m "feat: enhanced rules engine with income verification, SSN dedup, and Plaid checks"
```

---

### Task 10: Update Admin Application Actions with Audit Logging

**Files:**
- Modify: `src/actions/applications.ts`

- [ ] **Step 1: Add audit logging to approve/reject actions**

Update `approveApplication` in `src/actions/applications.ts`:

```typescript
import { logAudit } from "@/lib/audit";
import { evaluateApplication } from "@/lib/rules-engine";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function approveApplication(
  applicationId: string,
  interestRate: number,
  loanTermMonths?: number
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { documents: true },
  });

  if (!application) return { success: false, error: "Application not found" };

  // Run evaluation
  const evaluation = await evaluateApplication(application);

  if (evaluation.recommendation === "REJECT") {
    return {
      success: false,
      error: "Application does not meet approval criteria",
      reasons: evaluation.reasons,
    };
  }

  const updatedApp = await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: "APPROVED",
      interestRate,
      loanTermMonths: loanTermMonths || application.loanTermMonths,
      approvedBy: session.user.email,
      approvedAt: new Date(),
    },
  });

  await logAudit({
    action: "APPROVE",
    entityType: "APPLICATION",
    entityId: applicationId,
    performedBy: session.user.email,
    details: {
      interestRate,
      loanTermMonths: loanTermMonths || application.loanTermMonths,
      recommendation: evaluation.recommendation,
      reasons: evaluation.reasons,
    },
  });

  return { success: true, application: updatedApp };
}

export async function rejectApplication(applicationId: string, reason: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });
  if (!application) return { success: false, error: "Application not found" };

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
    },
  });

  await logAudit({
    action: "REJECT",
    entityType: "APPLICATION",
    entityId: applicationId,
    performedBy: session.user.email,
    details: { reason },
  });

  return { success: true, application };
}
```

- [ ] **Step 2: Add SSN reveal action with audit logging**

Add to `src/actions/applications.ts`:

```typescript
import { decrypt } from "@/lib/encryption";

export async function revealSSN(applicationId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { ssnEncrypted: true },
  });

  if (!application?.ssnEncrypted) {
    return { success: false, error: "No SSN on file" };
  }

  await logAudit({
    action: "VIEW_SSN",
    entityType: "APPLICATION",
    entityId: applicationId,
    performedBy: session.user.email,
  });

  const ssn = decrypt(application.ssnEncrypted);
  return { success: true, ssn };
}
```

- [ ] **Step 3: Add audit logging to settings updates**

In `src/actions/settings.ts`, add audit logging to `updateLoanRule`:

```typescript
import { logAudit } from "@/lib/audit";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// IMPORTANT: Keep the existing function signature (id, value) to match
// how settings-client.tsx calls this function. Look up the key for auditing.
export async function updateLoanRule(id: string, value: string) {
  const session = await getServerSession(authOptions);

  const existing = await prisma.loanRule.findUnique({ where: { id } });
  if (!existing) throw new Error("Rule not found");
  const oldValue = existing.value;

  const rule = await prisma.loanRule.update({
    where: { id },
    data: { value },
  });

  if (session?.user?.email) {
    await logAudit({
      action: "CHANGE_SETTING",
      entityType: "LOAN_RULE",
      entityId: existing.key,
      performedBy: session.user.email,
      details: { oldValue, newValue: value },
    });
  }

  return rule;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/actions/applications.ts src/actions/settings.ts
git commit -m "feat: add audit logging to approve, reject, SSN reveal, and settings actions"
```

---

### Task 11: Email Templates and Sending

**Files:**
- Create: `src/lib/emails/application-submitted.ts`
- Create: `src/lib/emails/application-approved.ts`
- Create: `src/lib/emails/application-rejected.ts`
- Create: `src/lib/emails/send.ts`

- [ ] **Step 1: Create email sending utility**

Create `src/lib/emails/send.ts`:

```typescript
import { resend, FROM_EMAIL } from "@/lib/email";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error };
  }
}
```

- [ ] **Step 2: Create application submitted email template**

Create `src/lib/emails/application-submitted.ts`:

```typescript
import { APP_URL } from "@/lib/email";

export function applicationSubmittedEmail(params: {
  firstName: string;
  applicationCode: string;
  loanAmount: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;

  return {
    subject: "Application Received — 1099 Loan Portal",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Application Received!</h2>
        <p>Hi ${params.firstName},</p>
        <p>We've received your loan application for <strong>$${params.loanAmount.toLocaleString()}</strong>.</p>
        <p>Your application code is: <strong style="font-size: 18px; letter-spacing: 2px;">${params.applicationCode}</strong></p>
        <p>You can check your application status anytime at:</p>
        <p><a href="${statusUrl}" style="color: #16a34a;">${statusUrl}</a></p>
        <p>We'll review your application and get back to you soon.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

- [ ] **Step 3: Create approved email template**

Create `src/lib/emails/application-approved.ts`:

```typescript
import { APP_URL } from "@/lib/email";

export function applicationApprovedEmail(params: {
  firstName: string;
  applicationCode: string;
  loanAmount: number;
  interestRate: number;
  loanTermMonths: number;
}) {
  const statusUrl = `${APP_URL}/status/${params.applicationCode}`;
  const monthlyRate = params.interestRate / 100 / 12;
  const months = params.loanTermMonths;
  const monthlyPayment =
    (params.loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, months))) /
    (Math.pow(1 + monthlyRate, months) - 1);

  return {
    subject: "Congratulations! Your Loan is Approved — 1099 Loan Portal",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #16a34a;">Your Loan Has Been Approved!</h2>
        <p>Hi ${params.firstName},</p>
        <p>Great news — your loan application has been approved.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Loan Amount</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${params.loanAmount.toLocaleString()}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Interest Rate</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.interestRate}% APR</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Term</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${params.loanTermMonths} months</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">Est. Monthly Payment</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">$${monthlyPayment.toFixed(2)}</td></tr>
        </table>
        <p>Next steps: We will wire the funds to your linked bank account. You'll receive a confirmation once the funds are sent.</p>
        <p>Track your loan at: <a href="${statusUrl}" style="color: #16a34a;">${statusUrl}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

- [ ] **Step 4: Create rejected email template**

Create `src/lib/emails/application-rejected.ts`:

```typescript
export function applicationRejectedEmail(params: {
  firstName: string;
  reason: string;
}) {
  return {
    subject: "Application Update — 1099 Loan Portal",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Application Update</h2>
        <p>Hi ${params.firstName},</p>
        <p>Unfortunately, we're unable to approve your loan application at this time.</p>
        <p><strong>Reason:</strong> ${params.reason}</p>
        <p>You're welcome to reapply in the future if your circumstances change.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6b7280; font-size: 12px;">1099 Loan Portal</p>
      </div>
    `,
  };
}
```

- [ ] **Step 5: Wire emails into actions**

In `src/actions/applications.ts`, after creating an application in `submitApplication`:

```typescript
import { sendEmail } from "@/lib/emails/send";
import { applicationSubmittedEmail } from "@/lib/emails/application-submitted";
import { applicationApprovedEmail } from "@/lib/emails/application-approved";
import { applicationRejectedEmail } from "@/lib/emails/application-rejected";

// After successful application creation — notify borrower:
const email = applicationSubmittedEmail({
  firstName: data.firstName,
  applicationCode,
  loanAmount: data.loanAmount,
});
await sendEmail({ to: data.email, ...email });

// Notify admin of new application:
const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
if (adminEmail) {
  await sendEmail({
    to: adminEmail,
    subject: `New Application: ${data.firstName} ${data.lastName} — $${data.loanAmount}`,
    html: `<p>New application received from ${data.firstName} ${data.lastName} for $${data.loanAmount.toLocaleString()}.</p><p>Code: ${applicationCode}</p><p><a href="${process.env.APP_URL}/admin/applications">Review in admin</a></p>`,
  });
}

// In approveApplication, after status update:
const emailData = applicationApprovedEmail({
  firstName: application.firstName,
  applicationCode: application.applicationCode,
  loanAmount: Number(application.loanAmount),
  interestRate,
  loanTermMonths: loanTermMonths || application.loanTermMonths,
});
await sendEmail({ to: application.email, ...emailData });

// In rejectApplication, after status update:
const emailData = applicationRejectedEmail({
  firstName: application.firstName,
  reason,
});
await sendEmail({ to: application.email, ...emailData });
```

Note: Fetch the application before updating in `rejectApplication` to get the email/name.

- [ ] **Step 6: Commit**

```bash
git add src/lib/emails/
git commit -m "feat: add email templates and send on submit, approve, and reject"
```

---

### Task 12: Server Action for Evaluation (client-callable)

**Files:**
- Create: `src/actions/evaluation.ts`

- [ ] **Step 1: Create evaluation action**

Create `src/actions/evaluation.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";
import { evaluateApplication } from "@/lib/rules-engine";
import type { EvaluationResult } from "@/lib/rules-engine";

export async function evaluateApplicationAction(
  applicationId: string
): Promise<EvaluationResult> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { documents: true },
  });

  if (!application) {
    return {
      recommendation: "MANUAL_REVIEW",
      reasons: ["Application not found"],
      suggestedRate: 30,
      rules: {},
    };
  }

  return evaluateApplication(application);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/actions/evaluation.ts
git commit -m "feat: add client-callable evaluation action for admin detail page"
```

---

### Task 13: Admin Application Detail — Enhanced UI

**Files:**
- Modify: `src/app/admin/applications/[id]/detail-client.tsx`

**Depends on:** Task 12 (evaluateApplicationAction), Task 10 (revealSSN, approveApplication with new signature)

- [ ] **Step 1: Add evaluation display to detail page**

In the detail client component, add a section showing the rules engine evaluation:

```tsx
// Add state and fetch evaluation on load
const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

useEffect(() => {
  async function loadEvaluation() {
    const result = await evaluateApplicationAction(application.id);
    setEvaluation(result);
  }
  loadEvaluation();
}, [application.id]);

// Display section:
{evaluation && (
  <div className="bg-white rounded-xl border p-6 mt-4">
    <h3 className="font-semibold text-gray-900 mb-3">System Recommendation</h3>
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
      evaluation.recommendation === "APPROVE"
        ? "bg-green-100 text-green-700"
        : evaluation.recommendation === "REJECT"
        ? "bg-red-100 text-red-700"
        : "bg-yellow-100 text-yellow-700"
    }`}>
      {evaluation.recommendation}
    </div>
    <ul className="mt-3 space-y-1">
      {evaluation.reasons.map((reason, i) => (
        <li key={i} className="text-sm text-gray-600">• {reason}</li>
      ))}
    </ul>
    <p className="mt-3 text-sm text-gray-500">
      Suggested rate: {evaluation.suggestedRate}% APR
    </p>
  </div>
)}
```

- [ ] **Step 2: Add SSN reveal button**

```tsx
const [ssn, setSsn] = useState<string | null>(null);
const [ssnLoading, setSsnLoading] = useState(false);

async function handleRevealSSN() {
  setSsnLoading(true);
  const result = await revealSSN(application.id);
  if (result.success) {
    setSsn(result.ssn);
  } else {
    toast.error(result.error || "Failed to reveal SSN");
  }
  setSsnLoading(false);
}

// In the detail display:
<div className="flex items-center gap-2">
  <span className="text-sm text-gray-500">SSN:</span>
  {ssn ? (
    <span className="font-mono text-sm">{ssn}</span>
  ) : (
    <button
      onClick={handleRevealSSN}
      disabled={ssnLoading}
      className="text-sm text-blue-600 hover:underline"
    >
      {ssnLoading ? "Loading..." : "Reveal SSN"}
    </button>
  )}
</div>
```

- [ ] **Step 3: Add interest rate and term inputs to approval flow**

Update the approve button section to include rate and term inputs:

```tsx
const [interestRate, setInterestRate] = useState(evaluation?.suggestedRate || 30);
const [approvalTermMonths, setApprovalTermMonths] = useState(
  application.loanTermMonths || 6
);

// Approval UI:
{application.status === "PENDING" && (
  <div className="bg-white rounded-xl border p-6 mt-4">
    <h3 className="font-semibold text-gray-900 mb-4">Decision</h3>
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Interest Rate (APR %)</label>
        <input
          type="number"
          value={interestRate}
          onChange={(e) => setInterestRate(Number(e.target.value))}
          min={1}
          max={100}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-600 mb-1">Term (months)</label>
        <input
          type="number"
          value={approvalTermMonths}
          onChange={(e) => setApprovalTermMonths(Number(e.target.value))}
          min={3}
          max={18}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>
    </div>
    <div className="flex gap-3">
      <button
        onClick={() => handleApprove(interestRate, approvalTermMonths)}
        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
      >
        Approve
      </button>
      <button
        onClick={() => setShowRejectModal(true)}
        className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
      >
        Reject
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Add Plaid income display**

```tsx
// Show verified income:
<div className="flex items-center gap-2">
  <span className="text-sm text-gray-500">Verified Monthly Income:</span>
  <span className="font-semibold">
    {application.monthlyIncome
      ? `$${Number(application.monthlyIncome).toLocaleString()}`
      : "Not verified"}
  </span>
  {application.plaidAccessToken && !application.monthlyIncome && (
    <button
      onClick={() => handleFetchIncome(application.id)}
      className="text-sm text-blue-600 hover:underline"
    >
      Fetch from Plaid
    </button>
  )}
</div>
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/applications/\\[id\\]/detail-client.tsx
git commit -m "feat: enhanced admin detail page with evaluation, SSN reveal, rate/term inputs, Plaid income"
```

---

### Task 14: Admin Audit Log Page

**Files:**
- Create: `src/app/admin/audit/page.tsx`
- Create: `src/app/admin/audit/audit-client.tsx`
- Create: `src/actions/audit.ts`

- [ ] **Step 1: Create audit log server action**

Create `src/actions/audit.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";

export async function getAuditLogs(params?: {
  action?: string;
  entityType?: string;
  performedBy?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (params?.action) where.action = params.action;
  if (params?.entityType) where.entityType = params.entityType;
  if (params?.performedBy) where.performedBy = params.performedBy;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params?.limit || 50,
      skip: params?.offset || 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}
```

- [ ] **Step 2: Create audit log client component**

Create `src/app/admin/audit/audit-client.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { getAuditLogs } from "@/actions/audit";

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  performedBy: string;
  details: string | null;
  createdAt: Date;
};

export default function AuditClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getAuditLogs({
        action: actionFilter || undefined,
      });
      setLogs(result.logs);
      setTotal(result.total);
      setLoading(false);
    }
    load();
  }, [actionFilter]);

  const actions = [
    "APPROVE", "REJECT", "FUND", "EDIT_INCOME",
    "VIEW_SSN", "CHANGE_SETTING", "LOGIN", "WAIVE_FEE",
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <span className="text-sm text-gray-500">{total} entries</span>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setActionFilter("")}
          className={`px-3 py-1 rounded-full text-sm ${
            !actionFilter ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          All
        </button>
        {actions.map((action) => (
          <button
            key={action}
            onClick={() => setActionFilter(action)}
            className={`px-3 py-1 rounded-full text-sm ${
              actionFilter === action ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {action}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">By</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100">
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {log.entityType} / {log.entityId.substring(0, 8)}...
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{log.performedBy}</td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                  {log.details || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create audit log page**

Create `src/app/admin/audit/page.tsx`:

```tsx
import AuditClient from "./audit-client";

export default function AuditPage() {
  return <AuditClient />;
}
```

- [ ] **Step 4: Add audit log link to admin sidebar**

In `src/components/admin-sidebar.tsx`, add an "Audit Log" nav item. The existing sidebar uses inline SVG icons in its `navItems` array — follow the same pattern. Add a clipboard/document icon as inline SVG and link to `/admin/audit`.

- [ ] **Step 5: Update middleware to protect audit route**

In `src/middleware.ts`, add `/admin/audit` to the protected paths matcher.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/audit/ src/actions/audit.ts src/components/admin-sidebar.tsx src/middleware.ts
git commit -m "feat: add admin audit log page with filtering"
```

---

### Task 15: Compliance Pages

**Files:**
- Create: `src/app/(public)/terms/page.tsx`
- Create: `src/app/(public)/privacy/page.tsx`
- Create: `src/app/(public)/disclosures/page.tsx`

- [ ] **Step 1: Create Terms of Service page**

Create `src/app/(public)/terms/page.tsx`:

```tsx
export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Terms of Service</h1>
      <div className="prose prose-gray">
        <p className="text-gray-600">Last updated: March 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>By accessing and using the 1099 Loan Portal, you agree to be bound by these Terms of Service.</p>

        <h2>2. Loan Products</h2>
        <p>We offer personal loans ranging from $100 to $10,000 with terms up to 18 months. Interest rates are determined based on your risk profile and may vary. All loan terms, including APR and repayment schedule, will be disclosed before you accept the loan.</p>

        <h2>3. Eligibility</h2>
        <p>To apply for a loan, you must be at least 18 years old, a U.S. resident, and have a valid bank account. Approval is subject to income verification and our underwriting criteria.</p>

        <h2>4. Repayment</h2>
        <p>Loan repayments are collected via ACH debit from your linked bank account on a monthly schedule. Late payments may incur fees. Failure to repay may result in collection actions.</p>

        <h2>5. Privacy</h2>
        <p>Your personal information is handled in accordance with our <a href="/privacy" className="text-green-600 hover:underline">Privacy Policy</a>.</p>

        <h2>6. Contact</h2>
        <p>For questions about these terms, contact us at support@1099loanportal.com.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create Privacy Policy page**

Create `src/app/(public)/privacy/page.tsx`:

```tsx
export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>
      <div className="prose prose-gray">
        <p className="text-gray-600">Last updated: March 2026</p>

        <h2>1. Information We Collect</h2>
        <p>We collect: personal information (name, email, phone, SSN), financial information (income, bank account details via Plaid), and uploaded documents (pay stubs, identification).</p>

        <h2>2. How We Use Your Information</h2>
        <p>Your information is used to: process your loan application, verify your identity and income, determine loan eligibility and terms, collect loan payments, and communicate with you about your account.</p>

        <h2>3. Data Security</h2>
        <p>Sensitive data including SSN and bank credentials are encrypted at rest using AES-256 encryption. We use Plaid for secure bank connections — your banking credentials are never stored on our servers.</p>

        <h2>4. Third-Party Services</h2>
        <p>We use Plaid for bank account verification and income data. Plaid's privacy practices are governed by their own privacy policy.</p>

        <h2>5. Data Retention</h2>
        <p>We retain your data for as long as your loan is active plus 7 years for regulatory compliance.</p>

        <h2>6. Your Rights</h2>
        <p>You may request access to or deletion of your personal data by contacting us at privacy@1099loanportal.com.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create Lending Disclosures page**

Create `src/app/(public)/disclosures/page.tsx`:

```tsx
export default function DisclosuresPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Lending Disclosures</h1>
      <div className="prose prose-gray">
        <p className="text-gray-600">Last updated: March 2026</p>

        <h2>Loan Terms</h2>
        <ul>
          <li><strong>Loan amounts:</strong> $100 – $10,000</li>
          <li><strong>Loan terms:</strong> 3 – 18 months</li>
          <li><strong>APR range:</strong> 30% – 60% (varies by risk profile)</li>
          <li><strong>Late fee:</strong> $25 per missed payment (after 3-day grace period)</li>
        </ul>

        <h2>Example Loan</h2>
        <p>A $5,000 loan at 36% APR over 12 months would have approximate monthly payments of $504.03 and total repayment of $6,048.36.</p>

        <h2>How Interest is Calculated</h2>
        <p>Interest is calculated using standard amortization. Each monthly payment consists of principal and interest. Early payments are interest-heavy, while later payments pay down more principal.</p>

        <h2>Late Payments</h2>
        <p>If a scheduled payment fails, we will retry daily. A $25 late fee is applied after a 3-day grace period. Accounts 30+ days overdue may be sent to collections.</p>

        <h2>Prepayment</h2>
        <p>You may pay off your loan early at any time without prepayment penalties.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add footer links to landing page**

In `src/app/page.tsx`, add footer links to Terms, Privacy, and Disclosures at the bottom of the page.

- [ ] **Step 5: Commit**

```bash
git add src/app/\\(public\\)/terms/ src/app/\\(public\\)/privacy/ src/app/\\(public\\)/disclosures/
git commit -m "feat: add Terms, Privacy Policy, and Lending Disclosures pages"
```

---

### Task 16: Update Admin Dashboard with New Fields

**Files:**
- Modify: `src/app/admin/dashboard/dashboard-client.tsx`

- [ ] **Step 1: Add new status filters**

Update the status filter to include all new statuses:

```tsx
const statuses = [
  "All", "PENDING", "APPROVED", "REJECTED",
  "ACTIVE", "LATE", "COLLECTIONS", "DEFAULTED", "PAID_OFF"
];
```

- [ ] **Step 2: Add platform and income columns to table**

Add columns for platform and verified income in the applications table:

```tsx
<th>Platform</th>
<th>Income</th>
// ...
<td>{app.platform || "—"}</td>
<td>{app.monthlyIncome ? `$${Number(app.monthlyIncome).toLocaleString()}/mo` : "—"}</td>
```

- [ ] **Step 3: Update stat cards to include new statuses**

Add stat cards for ACTIVE, LATE, COLLECTIONS, DEFAULTED, PAID_OFF counts.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/dashboard/dashboard-client.tsx
git commit -m "feat: update admin dashboard with new statuses, platform, and income columns"
```

---

### Task 17: Fund Application Action

**Files:**
- Modify: `src/actions/applications.ts`

- [ ] **Step 1: Add fundApplication action**

Add to `src/actions/applications.ts`:

```typescript
export async function fundApplication(applicationId: string, fundedAmount: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { success: false, error: "Not authenticated" };

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });

  if (!application) return { success: false, error: "Application not found" };
  if (application.status !== "APPROVED") {
    return { success: false, error: "Application must be APPROVED to fund" };
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: "ACTIVE",
      fundedAt: new Date(),
      fundedAmount,
    },
  });

  await logAudit({
    action: "FUND",
    entityType: "APPLICATION",
    entityId: applicationId,
    performedBy: session.user.email,
    details: { fundedAmount },
  });

  return { success: true };
}
```

Note: Payment schedule generation will be implemented in Phase 2. For Phase 1, funding just changes the status and records the amount.

- [ ] **Step 2: Add fund button to admin detail page**

In the detail client, add a "Fund" button that shows when status is APPROVED:

```tsx
{application.status === "APPROVED" && (
  <div className="bg-white rounded-xl border p-6 mt-4">
    <h3 className="font-semibold text-gray-900 mb-4">Fund Loan</h3>
    <p className="text-sm text-gray-600 mb-4">
      After wiring the funds, click below to mark this loan as funded.
    </p>
    <div className="mb-4">
      <label className="block text-sm text-gray-600 mb-1">Funded Amount ($)</label>
      <input
        type="number"
        value={fundAmount}
        onChange={(e) => setFundAmount(Number(e.target.value))}
        className="w-full px-3 py-2 border rounded-lg"
      />
    </div>
    <button
      onClick={handleFund}
      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
    >
      Mark as Funded
    </button>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/applications.ts src/app/admin/applications/\\[id\\]/detail-client.tsx
git commit -m "feat: add fund application action with audit logging"
```

---

### Task 18: Update New Settings in Admin Settings Page

**Files:**
- Modify: `src/app/admin/settings/settings-client.tsx`

- [ ] **Step 1: Ensure new loan rules display in settings**

The settings page already dynamically renders all `LoanRule` records. Since we seeded the new rules in Task 1 (min_loan, min_bank_balance, max_loan_term_months, min_interest_rate, late_fee_amount, late_fee_grace_days, collections_threshold_days), they should automatically appear.

Verify the settings page renders them properly. If the current UI groups or labels them, add appropriate labels for the new rules.

- [ ] **Step 2: Commit if changes were needed**

```bash
git add src/app/admin/settings/settings-client.tsx
git commit -m "feat: verify new loan rules display in admin settings"
```

---

### Task 19: Build and Verify Phase 1

- [ ] **Step 1: Run the build**

```bash
cd /Users/baralezrah/loan-portal
npm run build
```

Expected: Build succeeds with no type errors.

- [ ] **Step 2: Start dev server and test**

```bash
npm run dev
```

Manual verification:
1. Navigate to `/apply` — verify all 7 steps render including loan term and Plaid Link
2. Navigate to `/admin/login` — login with admin credentials
3. Navigate to `/admin/dashboard` — verify new status filters and columns
4. Navigate to `/admin/audit` — verify audit log page loads
5. Navigate to `/terms`, `/privacy`, `/disclosures` — verify pages render

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues for Phase 1"
```

---

## Dependency Graph

```
Task 1 (Schema) → Task 2 (Encryption) → Task 7 (Submit Action)
Task 1 (Schema) → Task 3 (Audit) → Task 10 (Audit in Actions)
Task 1 (Schema) → Task 4 (Dependencies) → Task 5 (Plaid Routes) → Task 6 (Form Update)
Task 7 → Task 11 (Emails)
Task 9 (Rules Engine) → Task 10 → Task 12 (Evaluation Action) → Task 13 (Detail Page)
Task 3 → Task 14 (Audit Log Page)
Task 15 (Compliance) — independent
Task 16 (Dashboard) — depends on Task 1
Task 17 (Fund) — depends on Task 3, Task 10
Task 18 (Settings) — depends on Task 1
Task 19 (Verify) — depends on all above
```

Tasks 1–5 are sequential foundation. Tasks 6–8 depend on 4–5. Tasks 9–14 are sequential (rules engine → actions → evaluation → detail page → audit page). Task 15 is fully independent. Task 19 is the final verification gate.

**Note:** Email template files use `.ts` extension (not `.tsx`) since they contain template literal HTML, not JSX. Add `ADMIN_NOTIFICATION_EMAIL` to env vars for admin new-application alerts.
