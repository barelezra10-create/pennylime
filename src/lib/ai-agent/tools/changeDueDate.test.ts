import { describe, it, expect, vi, beforeEach } from "vitest";

const findContact = vi.fn();
const updatePayment = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    contact: { findUnique: (...a: unknown[]) => findContact(...a) },
    payment: { update: (...a: unknown[]) => updatePayment(...a) },
  },
}));

import { changeDueDate } from "./changeDueDate";
import { issueToken } from "../confirmation";

const ctx = { channel: "chat", sessionId: "s1", authLevel: "verified", contactId: "c1", metadata: {} } as const;

beforeEach(() => {
  findContact.mockReset();
  updatePayment.mockReset();
});

describe("changeDueDate", () => {
  it("returns denied_confirm without token", async () => {
    findContact.mockResolvedValue({ application: { id: "a1", payments: [{ id: "p1", paidAt: null, dueDate: new Date("2026-06-01") }] } });
    const res = await changeDueDate.handler({ newDate: "2026-06-15" }, ctx);
    expect(res.status).toBe("denied_confirm");
  });
  it("executes with valid token on next unpaid payment", async () => {
    findContact.mockResolvedValue({ application: { id: "a1", payments: [{ id: "p1", paidAt: null, dueDate: new Date("2026-06-01") }] } });
    updatePayment.mockResolvedValue({});
    const token = issueToken("s1", "changeDueDate", { newDate: "2026-06-15" });
    const res = await changeDueDate.handler({ newDate: "2026-06-15", confirm: token }, ctx);
    expect(res.status).toBe("ok");
    expect(updatePayment).toHaveBeenCalled();
  });
});
