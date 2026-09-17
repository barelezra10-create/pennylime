import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  portal: vi.fn(),
  agreement: vi.fn(),
  replace: vi.fn(),
  createPayments: vi.fn(),
  sign: vi.fn(),
  app: vi.fn(),
  consent: vi.fn(),
  event: vi.fn(),
  audit: vi.fn(),
  send: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireNonSupportRole: m.auth }));
vi.mock("@/lib/portal-auth", () => ({ getPortalApplicationId: m.portal }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "test" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/emails/send", () => ({ sendEmail: m.send }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        settlementAgreement: {
          findUnique: m.agreement,
          update: m.sign,
          updateMany: vi.fn(),
          create: m.create,
        },
        application: { update: m.app },
        payment: { updateMany: m.replace, createMany: m.createPayments },
        achAuthorization: { create: m.consent },
        collectionEvent: { create: m.event },
        auditLog: { create: m.audit },
      }),
  },
}));
import {
  acceptSettlementAgreement,
  createSettlementDraft,
  sendSettlementAgreement,
} from "./settlements";
import { buildSettlementPlan, settlementSnapshot } from "@/lib/settlement-plan";
const consent = {
  id: "s",
  signedName: "Test Customer",
  agreedToAgreement: true,
  agreedToAch: true,
};
function fixture() {
  const p = {
    id: "old",
    applicationId: "app",
    paymentNumber: 2,
    status: "RETURNED",
    amount: 100,
    principal: 80,
    lateFee: 0,
    collectedAmount: 20,
    dueDate: new Date("2026-08-01"),
    supersededBySettlementId: null,
  };
  const schedule = buildSettlementPlan(
    { total: 60, count: 2, frequency: "WEEKLY", firstDate: "2030-01-07" },
    new Date("2026-09-17"),
  );
  return {
    id: "s",
    applicationId: "app",
    status: "SENT",
    total: 60,
    installmentCount: 2,
    frequency: "WEEKLY",
    firstPaymentDate: new Date("2030-01-07T12:00:00Z"),
    expiresAt: new Date("2030-01-05"),
    scheduleJson: JSON.stringify(schedule),
    previousScheduleJson: settlementSnapshot([p]),
    agreementHash: "hash",
    authorizationText: "approved authorization",
    application: {
      status: "DEFAULTED",
      payments: [p],
      contact: { id: "contact" },
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ ok: true, email: "manager@example.com" });
  m.portal.mockResolvedValue("app");
  m.agreement.mockResolvedValue(fixture());
  m.replace.mockResolvedValue({ count: 1 });
});
describe("settlement signing", () => {
  it("atomically replaces only unpaid rows, records consent, and creates the exact agreed payments", async () => {
    expect(await acceptSettlementAgreement(consent)).toEqual({ ok: true });
    expect(m.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "CANCELED", supersededBySettlementId: "s" },
      }),
    );
    const rows = m.createPayments.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(
      rows.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0),
    ).toBe(60);
    expect(rows[0]).toMatchObject({
      settlementId: "s",
      paymentNumber: 3,
      status: "PENDING",
    });
    expect(m.consent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        signedName: "Test Customer",
        agreementVersion: "settlement:s",
        agreementHash: "hash",
      }),
    });
    expect(m.app).toHaveBeenCalledWith({
      where: { id: "app" },
      data: { status: "REPAYING" },
    });
    expect(m.send).not.toHaveBeenCalled();
  });
  it("rejects a different portal account", async () => {
    m.portal.mockResolvedValue("other");
    expect((await acceptSettlementAgreement(consent)).ok).toBe(false);
    expect(m.replace).not.toHaveBeenCalled();
  });
  it.each(["DRAFT", "CANCELED", "EXPIRED"])(
    "cannot accept a %s agreement",
    async (status) => {
      m.agreement.mockResolvedValue({ ...fixture(), status });
      expect((await acceptSettlementAgreement(consent)).ok).toBe(false);
      expect(m.replace).not.toHaveBeenCalled();
    },
  );
  it("rejects omitted consent and expired agreements", async () => {
    expect(
      (await acceptSettlementAgreement({ ...consent, agreedToAch: false })).ok,
    ).toBe(false);
    m.agreement.mockResolvedValue({
      ...fixture(),
      expiresAt: new Date("2020-01-01"),
    });
    expect((await acceptSettlementAgreement(consent)).ok).toBe(false);
    expect(m.replace).not.toHaveBeenCalled();
  });
  it.each(["PROCESSING", "PAID"])(
    "rejects payment changed to %s after the offer",
    async (status) => {
      const f = fixture();
      f.application.payments[0].status = status;
      m.agreement.mockResolvedValue(f);
      expect((await acceptSettlementAgreement(consent)).ok).toBe(false);
      expect(m.replace).not.toHaveBeenCalled();
    },
  );
  it("does not duplicate an already active schedule", async () => {
    m.agreement.mockResolvedValue({ ...fixture(), status: "ACTIVE" });
    expect((await acceptSettlementAgreement(consent)).ok).toBe(true);
    expect(m.createPayments).not.toHaveBeenCalled();
  });
  it("rejects a lost race with payment processing before creating new rows", async () => {
    m.replace.mockResolvedValue({ count: 0 });
    expect((await acceptSettlementAgreement(consent)).ok).toBe(false);
    expect(m.createPayments).not.toHaveBeenCalled();
  });
  it("does not permit support-only staff to draft or send financial agreements", async () => {
    m.auth.mockResolvedValue({ ok: false, error: "Not permitted" });
    expect(
      (
        await createSettlementDraft({
          applicationId: "app",
          total: 60,
          count: 2,
          frequency: "WEEKLY",
          firstDate: "2030-01-07",
          expiresAt: "2030-01-05",
          agreementText: "Reviewed agreement text",
        })
      ).ok,
    ).toBe(false);
    expect((await sendSettlementAgreement("s")).ok).toBe(false);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
});
