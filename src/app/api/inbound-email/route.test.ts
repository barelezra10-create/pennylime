import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  contact: { findFirst: vi.fn(), update: vi.fn() },
  inboundEmail: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  emailEvent: { create: vi.fn() },
  activity: { create: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => ({ storage: {} }));
vi.mock("@/lib/support-autoresponder", () => ({ maybeDraftReply: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/notify", () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined), getAdminUrl: () => "https://example.test" }));
import { POST } from "./route";

function request(secret = "test-secret") {
  return new NextRequest("https://example.test/api/inbound-email", {
    method: "POST", headers: { "x-inbound-secret": secret, "content-type": "application/json" },
    body: JSON.stringify({ from: "Client <CLIENT@example.com>", to: "info@pennylime.com", subject: "Re: Your account", text: "Can you help?", messageId: "gmail-id", receivedAt: "2026-09-24T12:00:00Z" }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INBOUND_EMAIL_SECRET", "test-secret");
  db.contact.findFirst.mockResolvedValue(null);
  db.contact.update.mockResolvedValue({});
  db.inboundEmail.findUnique.mockReset().mockResolvedValue(null);
  db.inboundEmail.create.mockReset().mockResolvedValue({ id: "inbound" });
  db.auditLog.create.mockResolvedValue({});
  db.emailEvent.create.mockResolvedValue({});
  db.activity.create.mockResolvedValue({});
});
it("saves an unmatched reply so account email fallback can display it", async () => {
  const res = await POST(request());
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, matched: false, inboundEmailId: "inbound" });
  expect(db.inboundEmail.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromEmail: "client@example.com", bodyText: "Can you help?", contactId: null, status: "UNREAD" }) });
});
it("links replies case-insensitively to the client", async () => {
  db.contact.findFirst.mockResolvedValue({ id: "contact", firstName: "Client", email: "CLIENT@example.com", applicationId: null });
  expect((await POST(request())).status).toBe(200);
  expect(db.contact.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: "client@example.com", mode: "insensitive" } } }));
  expect(db.inboundEmail.create).toHaveBeenCalledWith({ data: expect.objectContaining({ contactId: "contact" }) });
});
it("does not acknowledge a reply that failed to persist", async () => {
  db.inboundEmail.create.mockRejectedValue(new Error("storage unavailable"));
  const res = await POST(request());
  expect(res.status).toBe(503);
  expect(await res.json()).not.toHaveProperty("ok", true);
  expect(db.auditLog.create).not.toHaveBeenCalled();
});
it("deduplicates retries without creating another message", async () => {
  db.inboundEmail.findUnique.mockResolvedValue({ id: "existing" });
  expect(await (await POST(request())).json()).toMatchObject({ ok: true, deduped: true, inboundEmailId: "existing" });
  expect(db.inboundEmail.create).not.toHaveBeenCalled();
});
it("accepts a duplicate inserted by a concurrent delivery", async () => {
  db.inboundEmail.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "concurrent" });
  db.inboundEmail.create.mockRejectedValue(new Error("unique constraint"));
  expect(await (await POST(request())).json()).toMatchObject({ ok: true, deduped: true, inboundEmailId: "concurrent" });
});
it("rejects unauthenticated ingestion before any database write", async () => {
  expect((await POST(request("wrong"))).status).toBe(401);
  expect(db.inboundEmail.create).not.toHaveBeenCalled();
});
