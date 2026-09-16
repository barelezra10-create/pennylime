import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), pdf: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/plaid-report-cache", () => ({ getCachedAssetReportPdf: mocks.pdf }));
import { GET } from "./route";
const request = () => GET(new NextRequest("http://localhost/api/admin/applications/app/asset-report/pdf"), { params: Promise.resolve({ id: "app" }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { email: "admin@example.com" } });
});
it("serves a PDF inline through the shared cache", async () => {
  mocks.pdf.mockResolvedValue({ buffer: Buffer.from("%PDF-saved") });
  const response = await request();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).toBe("%PDF-saved");
  expect(mocks.pdf).toHaveBeenCalledWith("app");
});
it("rejects unauthenticated requests before any paid access", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await request()).status).toBe(401);
  expect(mocks.pdf).not.toHaveBeenCalled();
});
it("explains how to retrieve a missing report", async () => {
  mocks.pdf.mockRejectedValue(new Error("No asset report on file"));
  const response = await request();
  expect(response.status).toBe(404);
  expect(await response.text()).toContain("Pull Asset Report");
});
it("handles reports that are not ready", async () => {
  mocks.pdf.mockRejectedValue(new Error("PRODUCT_NOT_READY"));
  expect((await request()).status).toBe(409);
});
