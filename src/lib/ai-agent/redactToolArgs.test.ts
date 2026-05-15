import { describe, it, expect } from "vitest";
import { redactToolArgs } from "./redactToolArgs";

describe("redactToolArgs", () => {
  it("redacts dob for verifyIdentity", () => {
    expect(redactToolArgs("verifyIdentity", { dob: "1990-04-12" })).toEqual({ dob: "[REDACTED]" });
  });
  it("leaves date untouched for schedulePayment", () => {
    expect(redactToolArgs("schedulePayment", { amount: 100, date: "2026-05-20" })).toEqual({ amount: 100, date: "2026-05-20" });
  });
  it("returns args unchanged for tools with no PII fields", () => {
    expect(redactToolArgs("getLoanProducts", {})).toEqual({});
    expect(redactToolArgs("escalateToTicket", { reason: "complex" })).toEqual({ reason: "complex" });
  });
});
