import { describe, it, expect } from "vitest";
import { evaluateWorkSignals } from "./work-verification";

describe("evaluateWorkSignals", () => {
  it("VERIFIED when a contractor has 3+ gig deposits", () => {
    const r = evaluateWorkSignals({
      workerType: "INDEPENDENT_CONTRACTOR",
      deposits: [
        { description: "UBER * EATS PAYMENT", amount: 420 },
        { description: "DD DOORDASH", amount: 310 },
        { description: "UBER BV", amount: 510 },
        { description: "WALMART GROCERY", amount: -55 },
      ],
    });
    expect(r.status).toBe("VERIFIED");
    expect(r.matchedCount).toBe(3);
    expect(r.reason).toContain("$1,240");
  });

  it("WEAK when a contractor has only 1-2 gig deposits", () => {
    const r = evaluateWorkSignals({
      workerType: "INDEPENDENT_CONTRACTOR",
      deposits: [
        { description: "LYFT INC", amount: 200 },
        { description: "PAYROLL ACME CORP", amount: 1800 },
      ],
    });
    expect(r.status).toBe("WEAK");
    expect(r.matchedCount).toBe(1);
  });

  it("UNVERIFIED when a contractor has deposits but none match a platform", () => {
    const r = evaluateWorkSignals({
      workerType: "INDEPENDENT_CONTRACTOR",
      deposits: [
        { description: "PAYROLL ACME CORP", amount: 1800 },
        { description: "ZELLE FROM MOM", amount: 100 },
      ],
    });
    expect(r.status).toBe("UNVERIFIED");
  });

  it("VERIFIED for a business owner with processor settlements", () => {
    const r = evaluateWorkSignals({
      workerType: "BUSINESS_OWNER",
      deposits: [
        { description: "STRIPE TRANSFER", amount: 1200 },
        { description: "SQ * SQUARE INC", amount: 800 },
        { description: "TOAST POS DEPOSIT", amount: 640 },
      ],
    });
    expect(r.status).toBe("VERIFIED");
    expect(r.matchedSources).toContain("stripe");
  });

  it("does not match processors for a contractor (wrong keyword set)", () => {
    const r = evaluateWorkSignals({
      workerType: "INDEPENDENT_CONTRACTOR",
      deposits: [
        { description: "STRIPE TRANSFER", amount: 1200 },
        { description: "SQUARE INC", amount: 800 },
        { description: "TOAST DEPOSIT", amount: 640 },
      ],
    });
    expect(r.status).toBe("UNVERIFIED");
  });

  it("UNVERIFIED with a clear reason when no deposits were readable", () => {
    const r = evaluateWorkSignals({ workerType: "BUSINESS_OWNER", deposits: [] });
    expect(r.status).toBe("UNVERIFIED");
    expect(r.reason).toMatch(/No deposits could be read/);
  });
});
