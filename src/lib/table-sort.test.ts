import { describe, expect, it } from "vitest";
import { compareTableValues, tableValue } from "./table-sort";

describe("table sorting", () => {
  it("sorts currency numerically, including negatives", () => {
    const values = ["$1,200.00", "$90.00", "-$10.00"].map(value => tableValue(value, "Amount"));
    expect(values.sort((a, b) => compareTableValues(a, b, "asc"))).toEqual([-10, 90, 1200]);
  });
  it("orders dates across months and years chronologically", () => {
    const values = ["Jan 2, 2026", "Dec 31, 2025", "Feb 1, 2026"];
    expect(values.sort((a, b) => compareTableValues(tableValue(a, "Due date"), tableValue(b, "Due date"), "asc"))).toEqual(["Dec 31, 2025", "Jan 2, 2026", "Feb 1, 2026"]);
  });
  it("keeps missing values last in either direction", () => {
    for (const direction of ["asc", "desc"] as const) {
      expect(compareTableValues(null, 100, direction)).toBeGreaterThan(0);
      expect(compareTableValues(100, null, direction)).toBeLessThan(0);
    }
    expect(tableValue("Not recorded", "Rejected")).toBeNull();
  });
  it("sorts names case-insensitively and embedded numbers naturally", () => {
    expect(compareTableValues("alice", "Bob", "asc")).toBeLessThan(0);
    expect(compareTableValues("Payment 2", "Payment 10", "asc")).toBeLessThan(0);
    expect(compareTableValues("alice", "ALICE", "asc")).toBe(0);
  });
});
