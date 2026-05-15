import { describe, it, expect, vi, beforeEach } from "vitest";

const findContact = vi.fn();
const sendSms = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { contact: { findUnique: (...a: unknown[]) => findContact(...a) } } }));
vi.mock("@/lib/sms/twilio", () => ({ sendSms: (...a: unknown[]) => sendSms(...a) }));

import { sendMagicLink } from "./sendMagicLink";

const ctx = { channel: "chat", sessionId: "s1", authLevel: "anon", contactId: "c1", metadata: {} } as const;

beforeEach(() => {
  findContact.mockReset();
  sendSms.mockReset();
});

describe("sendMagicLink", () => {
  it("sends an SMS with the status link", async () => {
    findContact.mockResolvedValue({ phone: "+15551234567", application: { applicationCode: "ABC123" } });
    sendSms.mockResolvedValue({ ok: true });
    const res = await sendMagicLink.handler({ channel: "sms" }, ctx);
    expect(res.status).toBe("ok");
    expect(sendSms).toHaveBeenCalled();
  });
});
