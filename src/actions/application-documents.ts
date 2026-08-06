"use server";

import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { getLoanRules } from "@/lib/rules-engine";
import { evaluateWorkSignals } from "@/lib/risk/work-verification";
import { incomeByPlatform } from "@/lib/income-by-platform";
import { buildMonthlyPL } from "@/lib/monthly-pl";
import { evaluateStatementGate } from "@/lib/statement-gate";

const ALLOWED_DOC_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
]);

export type StatementRef = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
};

/**
 * Applicant-facing: called right after submitApplication() returns the
 * new application id. The statement file(s) are uploaded separately
 * through the /api/upload multipart route (which has no Server Action
 * body limit), and this action receives only their lightweight storage
 * refs — so a multi-MB PDF never travels through a Server Action, which
 * was silently rejecting them at the 1MB default and leaving
 * applications with no statement. Creates the Document rows, saves the
 * EIN, parses the statement, and runs the work-verification comparator.
 * WEAK/UNVERIFIED soft-flags for manual review; never blocks submission.
 */
export async function finalizeDocumentsAndVerify(
  applicationId: string,
  input: { ein?: string; statements: StatementRef[]; preview?: boolean }
) {
  try {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, workerType: true, platform: true },
    });
    if (!app) return { ok: false as const, error: "Application not found" };

    const rules = await getLoanRules();
    const maxBytes = Number(rules.max_file_size_mb || "10") * 1024 * 1024;

    // 1. Record the already-uploaded statement files as Document rows and
    //    pull their bytes back from storage for AI parsing.
    const refs = (input.statements ?? []).filter(
      (s) =>
        s &&
        s.storagePath &&
        ALLOWED_DOC_TYPES.has(s.mimeType) &&
        s.fileSize <= maxBytes,
    );
    const stored: Array<{ filename: string; buffer: Buffer; mimeType: string }> = [];
    for (const ref of refs) {
      await prisma.document.create({
        data: {
          applicationId,
          fileName: ref.fileName,
          mimeType: ref.mimeType,
          fileSize: ref.fileSize,
          storagePath: ref.storagePath,
          documentType: "BANK_STATEMENT_90D",
        },
      });
      try {
        const buffer = await storage.read(ref.storagePath);
        stored.push({ filename: ref.fileName, buffer, mimeType: ref.mimeType });
      } catch (err) {
        console.error("[finalizeDocuments] could not read stored statement:", ref.fileName, err);
      }
    }

    // 2. Save EIN (business owners).
    const ein = (input.ein ?? "").replace(/\D/g, "");
    if (ein) {
      await prisma.application.update({
        where: { id: applicationId },
        data: { ein: ein.replace(/(\d{2})(\d{7})/, "$1-$2") },
      });
    }

    // 3. Parse the statement (best-effort) to get deposits + income.
    let deposits: Array<{ description: string; amount: number }> = [];
    let gate: ReturnType<typeof evaluateStatementGate> | null = null;
    if (stored.length > 0) {
      try {
        const { parseStatementsWithAI } = await import("@/lib/bank-statement-parser");
        const parsed = await parseStatementsWithAI(stored);
        deposits = (parsed.deposits ?? []).map((d) => ({
          description: d.description,
          amount: d.amount,
        }));
        const platformBreakdown = parsed.deposits && parsed.deposits.length > 0
          ? incomeByPlatform(parsed.deposits, app.platform ?? null)
          : null;
        const pnl = (parsed.deposits?.length || parsed.expenses?.length)
          ? buildMonthlyPL(platformBreakdown, parsed.expenses ?? [])
          : null;
        const incomeDates = (parsed.deposits ?? [])
          .filter((d) => (d.classification ?? "income") === "income" && Number(d.amount) > 0)
          .map((d) => d.date)
          .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s || ""))
          .sort();
        const lastDep = incomeDates[incomeDates.length - 1];
        await prisma.application.update({
          where: { id: applicationId },
          data: {
            monthlyIncome: parsed.monthlyIncome,
            totalIncome: parsed.monthlyIncome * 3,
            avgWeeklyIncome: parsed.avgWeeklyIncome,
            depositCount90d: parsed.depositCount,
            largestDeposit: parsed.largestDeposit,
            nsfCount90d: parsed.nsfCount ?? 0,
            daysNegative90d: parsed.daysNegative ?? 0,
            minBalance90d: parsed.minBalance == null ? null : parsed.minBalance,
            lastDepositAt: lastDep ? new Date(lastDep) : null,
            ...(platformBreakdown ? { incomeByPlatformJson: JSON.stringify(platformBreakdown) } : {}),
            ...(pnl ? { monthlyPnlJson: JSON.stringify(pnl) } : {}),
          },
        });

        // Server-side backstop for the funnel gates (a client could bypass the
        // document-step check). A definitive breach auto-declines the app.
        gate = evaluateStatementGate({
          deposits: parsed.deposits ?? [],
          expenses: parsed.expenses ?? [],
          platforms: app.platform ?? null,
          workerType: app.workerType ?? "INDEPENDENT_CONTRACTOR",
        });
      } catch (err) {
        console.error("[finalizeDocuments] statement parse failed:", err);
      }
    }

    // If the statements fail a hard gate, classify the application as
    // UNQUALIFIED server-side (its own bucket next to Rejected) so the lead is
    // still visible for review instead of proceeding to underwriting. In admin
    // preview we still return the block (so the Test application flow shows the
    // decline screen) but skip the DB write so test submissions aren't touched.
    if (gate && gate.ok === false) {
      if (!input.preview) {
        await prisma.application.update({
          where: { id: applicationId },
          data: {
            status: "UNQUALIFIED",
            workVerificationStatus: "UNVERIFIED",
            workVerificationJson: JSON.stringify({ status: "UNVERIFIED", reason: gate.message }),
            workVerificationAt: new Date(),
            workNeedsReview: true,
          },
        });
        await prisma.auditLog.create({
          data: {
            action: "APPLICATION_UNQUALIFIED",
            entityType: "APPLICATION",
            entityId: applicationId,
            performedBy: "system",
            details: JSON.stringify({ reason: gate.reason, message: gate.message }),
          },
        });
      }
      return { ok: false as const, blocked: true as const, reason: gate.reason, message: gate.message };
    }

    // 4. Verify the declared work against the deposits.
    const verdict = evaluateWorkSignals({
      workerType: app.workerType ?? "INDEPENDENT_CONTRACTOR",
      deposits,
    });
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        workVerificationStatus: verdict.status,
        workVerificationJson: JSON.stringify(verdict),
        workVerificationAt: new Date(),
        workNeedsReview: verdict.status !== "VERIFIED",
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "WORK_VERIFICATION",
        entityType: "APPLICATION",
        entityId: applicationId,
        performedBy: "applicant",
        details: JSON.stringify({
          statements: stored.length,
          hasEin: !!ein,
          status: verdict.status,
          reason: verdict.reason,
        }),
      },
    });

    return { ok: true as const, status: verdict.status };
  } catch (err) {
    console.error("[finalizeDocumentsAndVerify] failed:", err);
    return { ok: false as const, error: "Document processing failed" };
  }
}
