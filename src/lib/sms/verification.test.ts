import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  record: vi.fn(), verificationUpdate: vi.fn(), contactUpdate: vi.fn(),
  contactUpdateMany: vi.fn(), config: vi.fn(), fetch: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {
  phoneVerification: { findFirst: m.record, update: m.verificationUpdate },
  contact: { update: m.contactUpdate, updateMany: m.contactUpdateMany },
} }));
vi.mock("@/lib/tracking/config", () => ({ getTrackingConfig: m.config }));
vi.mock("@/lib/sms/twilio", () => ({ sendSms: vi.fn() }));
import { checkVerificationCode } from "./verification";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", m.fetch);
  m.contactUpdate.mockResolvedValue({});
  m.contactUpdateMany.mockResolvedValue({ count: 1 });
  m.verificationUpdate.mockResolvedValue({});
  m.config.mockResolvedValue({ twilioAccountSid: "test", twilioAuthToken: "test", twilioVerifyServiceSid: "test" });
});

afterEach(() => vi.unstubAllGlobals());

describe("verification does not enroll the recipient in ongoing SMS", () => {
  for (const provider of ["local", "twilio"] as const) {
    for (const contactId of ["contact-1", undefined]) {
      it(`${provider}, ${contactId ? "linked contact" : "phone lookup"}`, async () => {
        m.record.mockResolvedValue({
          id: "verification-1", attempts: 0, contactId,
          codeHash: provider === "twilio" ? "TWILIO_VERIFY" : createHash("sha256").update("123456").digest("hex"),
        });
        m.fetch.mockResolvedValue({ ok: true, json: async () => ({ status: "approved" }) });
        expect(await checkVerificationCode({ phone: "+18886912706", code: "123456", contactId }))
          .toEqual({ ok: true, verified: true });
        const update = contactId ? m.contactUpdate : m.contactUpdateMany;
        expect(update).toHaveBeenCalledOnce();
        expect(update.mock.calls[0][0].data).toEqual({ phoneVerifiedAt: expect.any(Date) });
      });
    }
  }
});
