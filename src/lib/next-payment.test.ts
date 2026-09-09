import { describe, it, expect } from "vitest";
import { earliestByDueDate } from "./next-payment";

describe("earliestByDueDate", () => {
  it("picks the earliest due date regardless of array order", () => {
    const payments = [
      { paymentNumber: 3, dueDate: new Date("2026-09-15") },
      { paymentNumber: 1, dueDate: new Date("2026-09-12") },
      { paymentNumber: 2, dueDate: new Date("2026-09-19") },
    ];
    expect(earliestByDueDate(payments)?.paymentNumber).toBe(1);
  });

  it("does NOT pick a skipped payment that kept paymentNumber 1 but was moved to the end", () => {
    // Reproduces the reported bug: #1 was skipped to the end (Oct 9), the
    // remaining pending payments are Sep 12-19. Next payment must be Sep 12.
    const payments = [
      { paymentNumber: 1, dueDate: new Date("2026-10-09") }, // skipped to end
      { paymentNumber: 2, dueDate: new Date("2026-09-12") },
      { paymentNumber: 3, dueDate: new Date("2026-09-15") },
      { paymentNumber: 4, dueDate: new Date("2026-09-16") },
    ];
    const next = earliestByDueDate(payments);
    expect(next?.paymentNumber).toBe(2);
    expect(next?.dueDate).toEqual(new Date("2026-09-12"));
  });

  it("accepts ISO string dueDates", () => {
    const payments = [
      { paymentNumber: 1, dueDate: "2026-10-09T00:00:00.000Z" },
      { paymentNumber: 2, dueDate: "2026-09-12T00:00:00.000Z" },
    ];
    expect(earliestByDueDate(payments)?.paymentNumber).toBe(2);
  });

  it("breaks ties by original array order (first wins)", () => {
    const payments = [
      { paymentNumber: 5, dueDate: new Date("2026-09-12") },
      { paymentNumber: 2, dueDate: new Date("2026-09-12") },
    ];
    expect(earliestByDueDate(payments)?.paymentNumber).toBe(5);
  });

  it("returns undefined for an empty list", () => {
    expect(earliestByDueDate([])).toBeUndefined();
  });
});
