# 1099 Loan Application Portal — Design Document

**Date:** 2026-03-10
**Status:** Approved

## Overview

MVP loan application portal for 1099 independent contractors. Applicants submit loan requests (up to $10k) with pay stub documentation. Admins review, verify income, and approve/reject. Business rules (loan limit, income multiplier) are configurable via admin settings.

## Decisions

- **Architecture:** Monolithic Next.js (App Router)
- **Stack:** Next.js, TypeScript, TailwindCSS, Shadcn UI, Prisma, PostgreSQL
- **Auth:** No auth for applicants (public form + status check via unique code). NextAuth credentials provider for admin.
- **Storage:** Local filesystem with abstraction layer (swap to S3 later)
- **Rules Engine:** Strategy pattern — manual approval now, algorithmic engine later

## Database Schema

### Application
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| applicationCode | String | Unique, 8-char alphanumeric, used for status lookup |
| firstName | String | |
| lastName | String | |
| email | String | |
| phone | String | |
| loanAmount | Decimal | |
| totalIncome | Decimal? | Entered by admin after doc review |
| status | Enum | PENDING, APPROVED, REJECTED |
| rejectionReason | String? | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Document
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| applicationId | UUID | FK → Application |
| fileName | String | |
| mimeType | String | |
| fileSize | Int | |
| storagePath | String | Abstracted path (local or S3) |
| documentType | Enum | PAY_STUB, TAX_1099, OTHER |
| createdAt | DateTime | |

### LoanRule
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| key | String | Unique (e.g. "loan_limit", "income_multiplier_ratio") |
| value | String | Parsed at runtime |
| description | String | |
| updatedAt | DateTime | |

### AdminUser
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| email | String | Unique |
| passwordHash | String | |
| name | String | |
| createdAt | DateTime | |

## Folder Structure

```
loan-portal/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   ├── apply/page.tsx
│   │   │   ├── status/page.tsx
│   │   │   └── status/[code]/page.tsx
│   │   ├── admin/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── applications/[id]/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── login/page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   └── upload/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── db.ts
│   │   ├── rules-engine.ts
│   │   ├── storage.ts
│   │   └── auth.ts
│   ├── actions/
│   │   ├── applications.ts
│   │   └── settings.ts
│   ├── components/
│   │   ├── ui/
│   │   ├── application-form.tsx
│   │   ├── application-table.tsx
│   │   ├── status-checker.tsx
│   │   └── document-viewer.tsx
│   └── types/
│       └── index.ts
├── uploads/
├── .env
└── package.json
```

## Core Abstractions

### Rules Engine
- Strategy pattern: `DecisionEngine` interface with `evaluate(application, rules)` method
- `ManualDecisionEngine`: Admin clicks approve/reject, engine validates income rule
- Future: `AutomatedDecisionEngine` for algorithmic decisions
- Rules fetched from `LoanRule` table (configurable via admin settings)

### Storage Provider
- `StorageProvider` interface: `upload()`, `getUrl()`, `delete()`
- `LocalStorageProvider`: saves to `./uploads/` directory
- Future: `S3StorageProvider`

## User Flows

### Applicant Submission
1. Fill form (name, email, phone, loan amount) + upload 3 pay stubs
2. Server validates: loan amount <= limit, files are PDF/image, max file size
3. Create Application + Documents, generate applicationCode
4. Show confirmation with code

### Status Check
1. Enter applicationCode on status page
2. See: Pending / Approved (with details) / Rejected (with reason)

### Admin Review
1. Login via NextAuth
2. Dashboard: list applications, filter by status
3. Click into application: view details, download docs
4. Enter totalIncome after reviewing documents
5. Approve or Reject (with reason) — rules engine validates eligibility
