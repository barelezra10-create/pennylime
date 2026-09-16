import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  findApp: vi.fn(), findDoc: vi.fn(), createDoc: vi.fn(), lock: vi.fn(),
  read: vi.fn(), upload: vi.fn(), pdf: vi.fn(), json: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: {
  $transaction: async (fn: (tx: unknown) => unknown) => fn({
    $queryRaw: mocks.lock,
    application: { findUnique: mocks.findApp },
    document: { findFirst: mocks.findDoc, create: mocks.createDoc },
  }),
} }));
vi.mock("@/lib/storage", () => ({ storage: { read: mocks.read, upload: mocks.upload } }));
vi.mock("@/lib/plaid", () => ({ plaidClient: { assetReportPdfGet: mocks.pdf, assetReportGet: mocks.json } }));
import { getCachedAssetReport, getCachedAssetReportPdf } from "./plaid-report-cache";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findApp.mockResolvedValue({ plaidAssetReportToken: "secret-report-token" });
  mocks.findDoc.mockResolvedValue(null);
  mocks.createDoc.mockResolvedValue({ id: "doc" });
  mocks.upload.mockResolvedValue("/uploads/report");
  mocks.pdf.mockResolvedValue({ data: Buffer.from("%PDF-example") });
});

describe("immutable Plaid report cache", () => {
  it("downloads once and reuses the file on analysis retries", async () => {
    await getCachedAssetReportPdf("app");
    mocks.findDoc.mockResolvedValue({ id: "doc", storagePath: "/uploads/report" });
    mocks.read.mockResolvedValue(Buffer.from("%PDF-example"));
    const result = await getCachedAssetReportPdf("app");
    expect(result.buffer.toString()).toBe("%PDF-example");
    expect(mocks.pdf).toHaveBeenCalledTimes(1);
    expect(mocks.createDoc).toHaveBeenCalledTimes(1);
    expect(mocks.lock).toHaveBeenCalledTimes(2);
  });
  it("keys the file by report token so a replacement report cannot reuse old data", async () => {
    await getCachedAssetReportPdf("app");
    const first = mocks.findDoc.mock.calls[0][0].where.fileName;
    mocks.findApp.mockResolvedValue({ plaidAssetReportToken: "replacement-token" });
    await getCachedAssetReportPdf("app");
    expect(mocks.findDoc.mock.calls[1][0].where.fileName).not.toBe(first);
    expect(first).not.toContain("secret-report-token");
  });
  it("does not silently rebill when a cached file cannot be read", async () => {
    mocks.findDoc.mockResolvedValue({ id: "doc", storagePath: "/missing" });
    mocks.read.mockRejectedValue(new Error("Storage unavailable"));
    await expect(getCachedAssetReportPdf("app")).rejects.toThrow("Storage unavailable");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("preserves PRODUCT_NOT_READY for the existing readiness poll", async () => {
    mocks.json.mockRejectedValue({ response: { data: { error_code: "PRODUCT_NOT_READY" } } });
    await expect(getCachedAssetReport("app")).rejects.toThrow("PRODUCT_NOT_READY");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("does not request a report when there is no token", async () => {
    mocks.findApp.mockResolvedValue(null);
    await expect(getCachedAssetReportPdf("app")).rejects.toThrow("No asset report");
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("returns saved JSON without another Plaid request", async () => {
    const report = { asset_report_id: "report", items: [] };
    mocks.findDoc.mockResolvedValue({ id: "doc", storagePath: "/saved.json" });
    mocks.read.mockResolvedValue(Buffer.from(JSON.stringify(report)));
    expect(await getCachedAssetReport("app")).toEqual(report);
    expect(mocks.json).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
});
