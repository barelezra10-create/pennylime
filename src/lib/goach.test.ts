// src/lib/goach.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/payment-processor", () => ({ goachEnv: vi.fn(() => null) }));
import { mapGoachStatus, parseDailyUpdate } from "./goach";

describe("mapGoachStatus", () => {
  it("maps success statuses to PAID", () => {
    for (const s of ["Funded", "Deposited"]) {
      expect(mapGoachStatus(s, null)).toEqual({ paymentStatus: "PAID", isSettled: true, isReturned: false });
    }
  });
  it("maps in-flight statuses to PROCESSING", () => {
    for (const s of ["Pending", "Processed", "Originated"]) {
      expect(mapGoachStatus(s, null).paymentStatus).toBe("PROCESSING");
    }
  });
  it("maps returns and NSF to RETURNED and flags them", () => {
    expect(mapGoachStatus("Returned", "R01")).toEqual({ paymentStatus: "RETURNED", isSettled: false, isReturned: true });
    expect(mapGoachStatus("NSF", null).paymentStatus).toBe("RETURNED");
  });
  it("maps Cancelled and Failed", () => {
    expect(mapGoachStatus("Cancelled", null).paymentStatus).toBe("CANCELED");
    expect(mapGoachStatus("Failed", null).paymentStatus).toBe("FAILED");
  });
  it("unknown status stays PROCESSING (never silently PAID)", () => {
    expect(mapGoachStatus("Weird", null).paymentStatus).toBe("PROCESSING");
  });
});

describe("parseDailyUpdate", () => {
  it("extracts status changes and the cursor", () => {
    const body = {
      data: [
        { ach_transaction_uuid: "tx-1", uuid: "c-1", updates: { current_status: ["Processed", "Funded"] } },
        { ach_transaction_uuid: "tx-2", uuid: "c-2", updates: { current_status: ["Processed", "Returned"] } },
        { ach_transaction_uuid: "tx-3", uuid: "c-3", updates: { amount: ["1", "2"] } },
      ],
      details: { new_pointer: "c-3", remaining_count: 0 },
    };
    const out = parseDailyUpdate(body);
    expect(out.changes).toEqual([
      { transactionUuid: "tx-1", from: "Processed", to: "Funded" },
      { transactionUuid: "tx-2", from: "Processed", to: "Returned" },
    ]);
    expect(out.newPointer).toBe("c-3");
    expect(out.remaining).toBe(0);
  });
});
