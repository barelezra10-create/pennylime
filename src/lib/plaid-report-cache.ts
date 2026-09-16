import "server-only";
import { createHash } from "node:crypto";
import type { AssetReport } from "plaid";
import { prisma } from "@/lib/db";
import { plaidClient } from "@/lib/plaid";
import { storage } from "@/lib/storage";

/** An Asset Report is immutable. Key both formats by its token, not by age. */
async function readReportFile(applicationId: string, format: "json" | "pdf") {
  return prisma.$transaction(async (tx) => {
    // Serialize across workers as well as concurrent admin/cron requests.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plaid-report:${applicationId}`}, 0))::text`;
    const app = await tx.application.findUnique({
      where: { id: applicationId },
      select: { plaidAssetReportToken: true },
    });
    const token = app?.plaidAssetReportToken;
    if (!token) throw new Error("No asset report on file — pull an Asset Report first.");
    const fingerprint = createHash("sha256").update(token).digest("hex");
    const fileName = `plaid-asset-${fingerprint}.${format}`;
    const documentType = format === "pdf" ? "PLAID_ASSET_REPORT_PDF" : "PLAID_ASSET_REPORT_JSON";
    const saved = await tx.document.findFirst({
      where: { applicationId, documentType, fileName },
      orderBy: { createdAt: "desc" },
    });
    // A storage failure must not silently trigger another paid download.
    if (saved) return { buffer: await storage.read(saved.storagePath), documentId: saved.id };

    const buffer = format === "pdf"
      ? Buffer.from((await plaidClient.assetReportPdfGet(
          { asset_report_token: token },
          { responseType: "arraybuffer", timeout: 30_000 },
        )).data as ArrayBuffer)
      : Buffer.from(JSON.stringify((await plaidClient.assetReportGet(
          { asset_report_token: token, include_insights: true },
          { timeout: 30_000 },
        )).data.report));
    if (!buffer.length) throw new Error("Plaid returned an empty asset report.");
    const storagePath = await storage.upload(buffer, fileName);
    const document = await tx.document.create({
      data: { applicationId, fileName, documentType, storagePath,
        mimeType: format === "pdf" ? "application/pdf" : "application/json", fileSize: buffer.length },
    });
    return { buffer, documentId: document.id };
  }, { maxWait: 5_000, timeout: 60_000 }).catch((error: unknown) => {
    const data = (error as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
    if (data?.error_code) throw new Error(`${data.error_code}: ${data.error_message ?? "Plaid report request failed"}`);
    throw error;
  });
}

export async function getCachedAssetReport(applicationId: string): Promise<AssetReport> {
  const { buffer } = await readReportFile(applicationId, "json");
  return JSON.parse(buffer.toString("utf8")) as AssetReport;
}

export async function getCachedAssetReportPdf(applicationId: string) {
  return readReportFile(applicationId, "pdf");
}
