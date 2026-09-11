import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  appGet: vi.fn(), appUpdate: vi.fn(), appAccept: vi.fn(), requestGet: vi.fn(), requestUpdate: vi.fn(), requestClear: vi.fn(),
  email: vi.fn(), sms: vi.fn(), contact: vi.fn(), auth: vi.fn(), payment: vi.fn(), audit: vi.fn(), lock: vi.fn(),
}));
vi.mock("next-auth", () => ({ getServerSession: m.auth }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/emails/send", () => ({ sendEmail: m.email }));
vi.mock("@/lib/emails/offer-ready", () => ({ offerReadyEmail: () => ({ subject: "Offer", html: "test" }) }));
vi.mock("@/lib/sms/transactional", () => ({ offerReadySms: () => "offer" }));
vi.mock("@/lib/sms/twilio", () => ({ sendSms: m.sms }));
vi.mock("@/lib/pdf/agreement-pdf", () => ({ buildFilledAgreementHtml: async () => "fixture", renderHtmlToPdf: async () => Buffer.from("fixture") }));
vi.mock("@/lib/compliance/cfdl/state-requirements", () => ({ normalizeStateCode: () => null, isCfdlState: () => false }));
vi.mock("@/lib/db", () => {
  const tx = { $queryRaw: m.lock, application: { findUnique: m.appGet, update: m.appUpdate, updateMany: m.appAccept }, advanceTopUpRequest: { findUnique: m.requestGet, update: m.requestUpdate, updateMany: m.requestClear }, contact: { findFirst: m.contact }, payment: { createMany: m.payment } };
  return { prisma: { ...tx, $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) } };
});
import { acceptOffer, resendOfferNotification } from "./offers";
const app = { id: "child", applicationCode: "CHILD", firstName: "Test", lastName: "Borrower", email: "test@example.com", phone: "test", offerStatus: "OFFERED", offerToken: "token", offeredMinAmount: 1400, offeredMaxAmount: 1400, offeredTermsJson: JSON.stringify([{ weeklyRemittance: 222.28, durationWeeks: 16, disbursedAmount: 1400, totalCostOfCapital: 2156.48, processingFee: 0, isRecommended: true }]) };
const acceptance = { applicationCode: "CHILD", token: "token", selectedAmount: 1400, selectedTermIndex: 0, agreedToAgreement: true, agreedToAch: true, scrolledToBottom: true, signedName: "Test Borrower" };
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ user: { email: "admin@example.com" } });
  m.appGet.mockResolvedValue(app);
  m.requestGet.mockResolvedValue({ id: "request", status: "APPROVED", contactId: "parent-contact" });
  m.email.mockResolvedValue({ success: true, id: "mail" });
  m.appAccept.mockResolvedValue({ count: 0 });
});
describe("top-up contract dispatch and signing", () => {
  it("sends the new contract and records success only after email acceptance", async () => {
    expect((await resendOfferNotification("child")).ok).toBe(true);
    expect(m.email).toHaveBeenCalledWith(expect.objectContaining({ to: "test@example.com", contactId: "parent-contact", attachments: [expect.objectContaining({ filename: "pennylime-offer-CHILD.pdf" })] }));
    expect(m.appUpdate.mock.invocationCallOrder[0]).toBeGreaterThan(m.email.mock.invocationCallOrder[0]);
    expect(m.requestClear).toHaveBeenCalled();
  });
  it("does not mark a failed email as sent and releases the edit lock", async () => {
    m.email.mockResolvedValue({ success: false });
    expect((await resendOfferNotification("child")).ok).toBe(false);
    expect(m.appUpdate).not.toHaveBeenCalled();
    expect(m.sms).not.toHaveBeenCalled();
    expect(m.requestClear).toHaveBeenCalledWith(expect.objectContaining({ data: { contractSendingAt: null } }));
  });
  it("does not dispatch a second concurrent send", async () => {
    m.requestGet.mockResolvedValue({ id: "request", contractSendingAt: new Date() });
    expect((await resendOfferNotification("child")).ok).toBe(false);
    expect(m.email).not.toHaveBeenCalled();
  });
  it("rejects draft signatures without creating payments", async () => {
    expect(await acceptOffer(acceptance)).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining("draft") }));
    expect(m.payment).not.toHaveBeenCalled();
  });
  it("requires explicit consent for a sent top-up", async () => {
    m.appGet.mockResolvedValue({ ...app, offerSentAt: new Date() });
    expect((await acceptOffer({ ...acceptance, agreedToAgreement: undefined })).ok).toBe(false);
    expect(m.payment).not.toHaveBeenCalled();
  });
  it("rejects a repeat acceptance transaction before creating duplicate payments", async () => {
    m.appGet.mockResolvedValue({ ...app, offerSentAt: new Date() });
    await expect(acceptOffer(acceptance)).rejects.toThrow("already been accepted or changed");
    expect(m.appAccept).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "child", offerStatus: "OFFERED", offerToken: "token" } }));
    expect(m.payment).not.toHaveBeenCalled();
  });
});
