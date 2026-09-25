import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), update: vi.fn(), claim: vi.fn(), debit: vi.fn(), email: vi.fn(), sms: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { payment: { findMany: mocks.findMany, update: mocks.update, updateMany: mocks.claim } } }));
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: () => null }));
vi.mock("@/lib/plaid-transfer", () => ({ initiateACHDebit: mocks.debit }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/emails/send", () => ({ sendEmail: mocks.email }));
vi.mock("@/lib/emails/payment-failed", () => ({ paymentFailedEmail: vi.fn() }));
vi.mock("@/lib/sms/twilio", () => ({ sendSms: mocks.sms }));
vi.mock("@/lib/sms/transactional", () => ({ paymentFailedSms: vi.fn() }));
vi.mock("@/lib/payment-pause", () => ({ paymentsPausedUntil: async () => null }));
vi.mock("@/lib/rules-engine", () => ({ getLoanRules: async () => ({}) }));
import { POST as process } from "@/app/api/cron/payment-processor/route";
import { POST as retry } from "@/app/api/cron/payment-retry/route";
beforeEach(() => { vi.resetAllMocks(); mocks.claim.mockResolvedValue({ count: 1 }); mocks.debit.mockResolvedValue({ success: false, skipped: true, error: "Not enough available balance. No charge was sent." }); });
it.each([{ run: process, status: "PENDING" }, { run: retry, status: "FAILED" }])("restores $status on a blocked debit without consuming a retry or sending failure messages", async ({ run, status }) => {
  mocks.findMany.mockResolvedValue([{ id: "p", applicationId: "app", status, retryCount: 2, application: { status: "ACTIVE" } }]);
  const response = await run(new NextRequest("https://example.com/cron", { method: "POST" }));
  expect(response.status).toBe(200);
  expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: "p" }, data: { status } });
  for (const [arg] of mocks.update.mock.calls) expect(arg.data).not.toHaveProperty("retryCount");
  expect(mocks.email).not.toHaveBeenCalled();
  expect(mocks.sms).not.toHaveBeenCalled();
  const result = await response.json();
  expect(result.skipped).toBeTruthy();
});

it.each([{ run: process, status: "PENDING" }, { run: retry, status: "FAILED" }])("does not debit a $status row replaced or claimed after the queue was read", async ({ run, status }) => {
  mocks.findMany.mockResolvedValue([{ id: "old", status, retryCount: 0, application: { status: "ACTIVE" } }]);
  mocks.claim.mockResolvedValue({ count: 0 });
  await run(new NextRequest("https://example.com/cron", { method: "POST" }));
  expect(mocks.debit).not.toHaveBeenCalled();
  const [claim] = mocks.claim.mock.calls[0];
  expect(claim).toMatchObject({
    where: {
      id: "old",
      status,
      supersededBySettlementId: null,
      application: { status: { in: ["FUNDED", "ACTIVE", "REPAYING", "LATE"] }, fundedAt: { not: null } },
    },
    data: { status: "PROCESSING" },
  });
  if (run === process) {
    expect(claim.where).toMatchObject({ settlementId: null, dueDate: { lte: expect.any(Date) } });
  }
});
