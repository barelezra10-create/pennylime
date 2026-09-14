import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ apps: vi.fn(), update: vi.fn(), event: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  application: { findMany: m.apps, update: m.update },
  contact: { findFirst: async () => null },
  payment: { findMany: async () => [{ amount: 100, lateFee: 0 }] },
  collectionEvent: { create: m.event },
} }));
vi.mock("@/lib/cron-auth", () => ({ verifyCronSecret: () => null }));
vi.mock("@/lib/payment-pause", () => ({ paymentsPausedUntil: async () => null }));
vi.mock("@/lib/emails/send", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/sms/twilio", () => ({ sendSms: vi.fn() }));
import { POST } from "./route";
beforeEach(() => vi.resetAllMocks());
it.each(["LATE", "COLLECTIONS"])("keeps %s accounts out of automatic default even after 120 days", async (status) => {
  const old = new Date(Date.now() - 120 * 86400000);
  m.apps.mockResolvedValue([{
    id: "a", status, firstName: "Test", email: "test@example.com", phone: "123",
    applicationCode: "TEST", payments: [{ dueDate: old }],
    collectionEvents: [
      { eventType: "ESCALATED", createdAt: old },
      { eventType: "WARNING_SENT", createdAt: old, notes: "14-day final-notice" },
    ],
  }]);
  const response = await POST(new NextRequest("http://localhost/api/cron/collections", { method: "POST" }));
  expect(response.status).toBe(200);
  expect((await response.json()).defaulted).toBe(0);
  expect(m.update).not.toHaveBeenCalled();
});
