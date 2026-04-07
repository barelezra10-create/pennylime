# 1099 Loan Application Portal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MVP loan application portal where 1099 contractors apply for loans up to $10k, upload pay stubs, and admins review/approve/reject with configurable business rules.

**Architecture:** Monolithic Next.js 14 App Router with Server Actions. Prisma ORM + PostgreSQL. Local file storage with abstraction layer. Strategy pattern for rules engine to allow future algorithmic approval.

**Tech Stack:** Next.js 14, TypeScript, TailwindCSS, Shadcn UI, Prisma, PostgreSQL, NextAuth.js, bcrypt, zod

---

## Task 1: Project Scaffolding & Dependencies

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.js`, `.env`, `.gitignore`

**Step 1: Initialize Next.js project**

```bash
cd /Users/baralezrah
npx create-next-app@latest loan-portal --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Note: The `loan-portal` directory already exists with `docs/`. The scaffolder should merge into it. If it fails, rename `docs/` temporarily, scaffold, then move `docs/` back.

**Step 2: Install dependencies**

```bash
cd /Users/baralezrah/loan-portal
npm install prisma @prisma/client next-auth @auth/prisma-adapter bcryptjs zod uuid
npm install -D @types/bcryptjs @types/uuid
```

**Step 3: Initialize Shadcn UI**

```bash
npx shadcn@latest init -d
```

Then add required components:

```bash
npx shadcn@latest add button card input label table badge dialog select textarea tabs separator toast
```

**Step 4: Create `.env`**

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/loan_portal"
NEXTAUTH_SECRET="development-secret-change-in-production"
NEXTAUTH_URL="http://localhost:3000"
UPLOAD_DIR="./uploads"
```

**Step 5: Update `.gitignore`**

Append:
```
uploads/
.env
```

**Step 6: Create uploads directory**

```bash
mkdir -p uploads
touch uploads/.gitkeep
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with dependencies"
```

---

## Task 2: Prisma Schema & Database Setup

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`

**Step 1: Write Prisma schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ApplicationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum DocumentType {
  PAY_STUB
  TAX_1099
  OTHER
}

model Application {
  id              String            @id @default(uuid())
  applicationCode String            @unique @db.VarChar(8)
  firstName       String
  lastName        String
  email           String
  phone           String
  loanAmount      Decimal           @db.Decimal(10, 2)
  totalIncome     Decimal?          @db.Decimal(10, 2)
  status          ApplicationStatus @default(PENDING)
  rejectionReason String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  documents       Document[]

  @@index([status])
  @@index([email])
}

model Document {
  id            String       @id @default(uuid())
  applicationId String
  fileName      String
  mimeType      String
  fileSize      Int
  storagePath   String
  documentType  DocumentType @default(PAY_STUB)
  createdAt     DateTime     @default(now())
  application   Application  @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
}

model LoanRule {
  id          String   @id @default(uuid())
  key         String   @unique
  value       String
  description String
  updatedAt   DateTime @updatedAt
}

model AdminUser {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())
}
```

**Step 2: Write seed file**

```typescript
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Seed default loan rules
  await prisma.loanRule.upsert({
    where: { key: "loan_limit" },
    update: {},
    create: {
      key: "loan_limit",
      value: "10000",
      description: "Maximum loan amount in USD",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "income_multiplier_ratio" },
    update: {},
    create: {
      key: "income_multiplier_ratio",
      value: "2.0",
      description:
        "Required ratio of 3-month income to loan amount (income >= ratio * loanAmount)",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "max_file_size_mb" },
    update: {},
    create: {
      key: "max_file_size_mb",
      value: "10",
      description: "Maximum file upload size in MB",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "required_pay_stubs" },
    update: {},
    create: {
      key: "required_pay_stubs",
      value: "3",
      description: "Number of pay stubs required with application",
    },
  });

  // Seed default admin user
  const passwordHash = await bcrypt.hash("admin123", 12);
  await prisma.adminUser.upsert({
    where: { email: "admin@loanportal.com" },
    update: {},
    create: {
      email: "admin@loanportal.com",
      passwordHash,
      name: "Admin User",
    },
  });

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Step 3: Add seed script to `package.json`**

Add to `package.json`:
```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```

Also install ts-node:
```bash
npm install -D ts-node
```

**Step 4: Run Prisma migration**

Ensure PostgreSQL is running locally, then:

```bash
npx prisma migrate dev --name init
```

Expected: Creates migration SQL, applies it, generates Prisma client.

**Step 5: Run seed**

```bash
npx prisma db seed
```

Expected: "Seed complete"

**Step 6: Commit**

```bash
git add prisma/ package.json package-lock.json
git commit -m "feat: add Prisma schema, migration, and seed data"
```

---

## Task 3: Core Library Layer (db, storage, rules engine, auth)

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/storage.ts`
- Create: `src/lib/rules-engine.ts`
- Create: `src/lib/auth.ts`
- Create: `src/types/index.ts`

**Step 1: Create Prisma client singleton**

```typescript
// src/lib/db.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Step 2: Create types**

```typescript
// src/types/index.ts
import { Application, Document, LoanRule } from "@prisma/client";

export type ApplicationWithDocuments = Application & {
  documents: Document[];
};

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  rules: Record<string, string>;
}

export interface StorageProvider {
  upload(file: Buffer, filename: string): Promise<string>;
  getUrl(storagePath: string): string;
  delete(storagePath: string): Promise<void>;
}

export interface DecisionEngine {
  evaluate(
    application: ApplicationWithDocuments,
    rules: Record<string, string>
  ): EligibilityResult;
}
```

**Step 3: Create storage abstraction**

```typescript
// src/lib/storage.ts
import { StorageProvider } from "@/types";
import fs from "fs/promises";
import path from "path";

class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || "./uploads";
  }

  async upload(file: Buffer, filename: string): Promise<string> {
    const dir = path.join(this.uploadDir, this.getDateFolder());
    await fs.mkdir(dir, { recursive: true });
    const uniqueName = `${Date.now()}-${filename}`;
    const filePath = path.join(dir, uniqueName);
    await fs.writeFile(filePath, file);
    return filePath;
  }

  getUrl(storagePath: string): string {
    return `/api/files/${encodeURIComponent(storagePath)}`;
  }

  async delete(storagePath: string): Promise<void> {
    await fs.unlink(storagePath).catch(() => {});
  }

  private getDateFolder(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
}

// Export singleton — swap this for S3StorageProvider later
export const storage: StorageProvider = new LocalStorageProvider();
```

**Step 4: Create rules engine**

```typescript
// src/lib/rules-engine.ts
import { prisma } from "@/lib/db";
import { DecisionEngine, EligibilityResult, ApplicationWithDocuments } from "@/types";

export async function getLoanRules(): Promise<Record<string, string>> {
  const rules = await prisma.loanRule.findMany();
  return Object.fromEntries(rules.map((r) => [r.key, r.value]));
}

export class ManualDecisionEngine implements DecisionEngine {
  evaluate(
    application: ApplicationWithDocuments,
    rules: Record<string, string>
  ): EligibilityResult {
    const loanLimit = parseFloat(rules.loan_limit || "10000");
    const multiplier = parseFloat(rules.income_multiplier_ratio || "2.0");
    const loanAmount = Number(application.loanAmount);
    const totalIncome = application.totalIncome
      ? Number(application.totalIncome)
      : null;

    if (loanAmount > loanLimit) {
      return {
        eligible: false,
        reason: `Loan amount $${loanAmount} exceeds limit of $${loanLimit}`,
        rules,
      };
    }

    if (totalIncome === null) {
      return {
        eligible: false,
        reason: "Total income has not been entered yet",
        rules,
      };
    }

    const requiredIncome = multiplier * loanAmount;
    if (totalIncome < requiredIncome) {
      return {
        eligible: false,
        reason: `Income $${totalIncome} is less than required $${requiredIncome} (${multiplier}x loan amount)`,
        rules,
      };
    }

    return { eligible: true, rules };
  }
}

// Export singleton — swap for AutomatedDecisionEngine later
export const decisionEngine: DecisionEngine = new ManualDecisionEngine();
```

**Step 5: Create NextAuth config**

```typescript
// src/lib/auth.ts
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.adminUser.findUnique({
          where: { email: credentials.email },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
};
```

**Step 6: Commit**

```bash
git add src/lib/ src/types/
git commit -m "feat: add core library layer (db, storage, rules engine, auth)"
```

---

## Task 4: NextAuth API Route & File Serve Route

**Files:**
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/api/files/[...path]/route.ts`

**Step 1: Create NextAuth route**

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

**Step 2: Create file serving route**

```typescript
// src/app/api/files/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // Only admins can access uploaded files
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filePath = decodeURIComponent(params.path.join("/"));

  // Prevent path traversal
  const resolved = path.resolve(filePath);
  const uploadsDir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  if (!resolved.startsWith(uploadsDir)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const file = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(file, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
```

**Step 3: Commit**

```bash
git add src/app/api/
git commit -m "feat: add NextAuth and file serving API routes"
```

---

## Task 5: Upload API Route

**Files:**
- Create: `src/app/api/upload/route.ts`

**Step 1: Create upload endpoint**

```typescript
// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { getLoanRules } from "@/lib/rules-engine";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const rules = await getLoanRules();
    const maxSizeMb = parseFloat(rules.max_file_size_mb || "10");
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    const results = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type: ${file.type}. Allowed: PDF, PNG, JPEG` },
          { status: 400 }
        );
      }

      if (file.size > maxSizeBytes) {
        return NextResponse.json(
          { error: `File ${file.name} exceeds ${maxSizeMb}MB limit` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const storagePath = await storage.upload(buffer, file.name);

      results.push({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        storagePath,
      });
    }

    return NextResponse.json({ files: results });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/upload/
git commit -m "feat: add file upload API route with validation"
```

---

## Task 6: Server Actions (Applications & Settings)

**Files:**
- Create: `src/actions/applications.ts`
- Create: `src/actions/settings.ts`

**Step 1: Create application server actions**

```typescript
// src/actions/applications.ts
"use server";

import { prisma } from "@/lib/db";
import { getLoanRules, decisionEngine } from "@/lib/rules-engine";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

function generateApplicationCode(): string {
  return uuidv4().replace(/-/g, "").substring(0, 8).toUpperCase();
}

const submitSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  loanAmount: z.number().positive("Loan amount must be positive"),
  files: z.array(
    z.object({
      fileName: z.string(),
      mimeType: z.string(),
      fileSize: z.number(),
      storagePath: z.string(),
    })
  ),
});

export async function submitApplication(data: z.infer<typeof submitSchema>) {
  const parsed = submitSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const rules = await getLoanRules();
  const loanLimit = parseFloat(rules.loan_limit || "10000");
  const requiredStubs = parseInt(rules.required_pay_stubs || "3");

  if (parsed.data.loanAmount > loanLimit) {
    return { error: `Loan amount cannot exceed $${loanLimit.toLocaleString()}` };
  }

  if (parsed.data.files.length < requiredStubs) {
    return { error: `At least ${requiredStubs} pay stubs are required` };
  }

  const applicationCode = generateApplicationCode();

  const application = await prisma.application.create({
    data: {
      applicationCode,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      loanAmount: parsed.data.loanAmount,
      documents: {
        create: parsed.data.files.map((f) => ({
          fileName: f.fileName,
          mimeType: f.mimeType,
          fileSize: f.fileSize,
          storagePath: f.storagePath,
          documentType: "PAY_STUB" as const,
        })),
      },
    },
  });

  return { success: true, applicationCode };
}

export async function getApplicationByCode(code: string) {
  const application = await prisma.application.findUnique({
    where: { applicationCode: code.toUpperCase() },
    select: {
      applicationCode: true,
      firstName: true,
      status: true,
      loanAmount: true,
      rejectionReason: true,
      createdAt: true,
    },
  });

  return application;
}

export async function getApplications(status?: string) {
  const where = status && status !== "ALL" ? { status: status as any } : {};
  return prisma.application.findMany({
    where,
    include: { documents: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getApplicationById(id: string) {
  return prisma.application.findUnique({
    where: { id },
    include: { documents: true },
  });
}

export async function updateTotalIncome(id: string, totalIncome: number) {
  return prisma.application.update({
    where: { id },
    data: { totalIncome },
  });
}

export async function approveApplication(id: string) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: { documents: true },
  });

  if (!application) return { error: "Application not found" };

  const rules = await getLoanRules();
  const result = decisionEngine.evaluate(application, rules);

  if (!result.eligible) {
    return { error: result.reason };
  }

  await prisma.application.update({
    where: { id },
    data: { status: "APPROVED" },
  });

  return { success: true };
}

export async function rejectApplication(id: string, reason: string) {
  if (!reason.trim()) {
    return { error: "Rejection reason is required" };
  }

  await prisma.application.update({
    where: { id },
    data: { status: "REJECTED", rejectionReason: reason },
  });

  return { success: true };
}
```

**Step 2: Create settings server actions**

```typescript
// src/actions/settings.ts
"use server";

import { prisma } from "@/lib/db";

export async function getLoanRulesAction() {
  return prisma.loanRule.findMany({ orderBy: { key: "asc" } });
}

export async function updateLoanRule(id: string, value: string) {
  if (!value.trim()) {
    return { error: "Value is required" };
  }

  // Validate numeric
  if (isNaN(parseFloat(value))) {
    return { error: "Value must be a number" };
  }

  await prisma.loanRule.update({
    where: { id },
    data: { value: value.trim() },
  });

  return { success: true };
}
```

**Step 3: Commit**

```bash
git add src/actions/
git commit -m "feat: add server actions for applications and settings"
```

---

## Task 7: Public Pages — Application Form

**Files:**
- Create: `src/app/(public)/apply/page.tsx`
- Create: `src/components/application-form.tsx`
- Create: `src/app/layout.tsx` (modify existing)
- Create: `src/app/page.tsx` (modify existing)

**Step 1: Update root layout** — add Toaster, update metadata.

**Step 2: Update root page** — simple landing with "Apply Now" and "Check Status" links.

**Step 3: Build `ApplicationForm` component**
- Form fields: firstName, lastName, email, phone, loanAmount
- File upload dropzone for pay stubs (min 3)
- Client-side uploads to `/api/upload` first, then calls `submitApplication` server action
- Shows success screen with applicationCode on completion
- Validation with zod on client + server

**Step 4: Build apply page** — renders `ApplicationForm`

**Step 5: Commit**

```bash
git add src/app/ src/components/
git commit -m "feat: add public application form page"
```

---

## Task 8: Public Pages — Status Check

**Files:**
- Create: `src/app/(public)/status/page.tsx`
- Create: `src/app/(public)/status/[code]/page.tsx`
- Create: `src/components/status-checker.tsx`

**Step 1: Build status entry page** — simple form to enter applicationCode

**Step 2: Build status result page** — fetches application by code, shows status badge (Pending=yellow, Approved=green, Rejected=red) with relevant details

**Step 3: Commit**

```bash
git add src/app/ src/components/
git commit -m "feat: add public status check pages"
```

---

## Task 9: Admin Login Page

**Files:**
- Create: `src/app/admin/login/page.tsx`

**Step 1: Build login form** — email + password, calls NextAuth `signIn("credentials")`

**Step 2: Redirect to `/admin/dashboard` on success

**Step 3: Commit**

```bash
git add src/app/admin/
git commit -m "feat: add admin login page"
```

---

## Task 10: Admin Layout & Auth Guard

**Files:**
- Create: `src/app/admin/layout.tsx`

**Step 1: Build admin layout**
- Server component that checks session via `getServerSession`
- If not authenticated, redirect to `/admin/login`
- Sidebar navigation: Dashboard, Settings, Logout
- Main content area

**Step 2: Commit**

```bash
git add src/app/admin/
git commit -m "feat: add admin layout with auth guard and sidebar"
```

---

## Task 11: Admin Dashboard

**Files:**
- Create: `src/app/admin/dashboard/page.tsx`
- Create: `src/components/application-table.tsx`

**Step 1: Build application table component**
- Columns: Date, Name, Email, Loan Amount, Status, Actions
- Status filter tabs: All, Pending, Approved, Rejected
- Click row → navigate to `/admin/applications/[id]`
- Badge colors per status

**Step 2: Build dashboard page** — fetches applications, renders table with filter

**Step 3: Commit**

```bash
git add src/app/admin/ src/components/
git commit -m "feat: add admin dashboard with application table"
```

---

## Task 12: Admin Application Detail Page

**Files:**
- Create: `src/app/admin/applications/[id]/page.tsx`
- Create: `src/components/document-viewer.tsx`

**Step 1: Build document viewer** — lists uploaded docs with download links, inline preview for images

**Step 2: Build application detail page**
- Shows all applicant info
- Document viewer
- Total income input field (editable)
- Approve button (calls `approveApplication` — engine validates eligibility)
- Reject button with reason textarea
- Status badge
- Back to dashboard link

**Step 3: Commit**

```bash
git add src/app/admin/ src/components/
git commit -m "feat: add admin application detail page with approve/reject"
```

---

## Task 13: Admin Settings Page

**Files:**
- Create: `src/app/admin/settings/page.tsx`

**Step 1: Build settings page**
- Lists all LoanRules from DB
- Each rule: key (read-only), description, editable value field
- Save button per rule
- Success/error feedback via toast

**Step 2: Commit**

```bash
git add src/app/admin/
git commit -m "feat: add admin settings page for dynamic loan rules"
```

---

## Task 14: Polish & Integration Testing

**Step 1: Manual smoke test all flows**
- Submit an application with 3 files
- Check status with code
- Admin login
- View dashboard, filter by status
- View application detail
- Set total income, approve
- Reject another with reason
- Update settings values

**Step 2: Fix any issues found**

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: polish and integration fixes"
```

---

## Default Credentials (Development)

| | |
|---|---|
| Admin Email | admin@loanportal.com |
| Admin Password | admin123 |

## Execution Notes

- PostgreSQL must be running locally on port 5432 before Task 2
- Each task builds on the previous — execute in order
- The rules engine and storage abstractions are designed for easy swapping — change the exported singleton in each file
