import { describe, it, expect } from "vitest";
import { redactPII } from "./redact";

describe("redactPII", () => {
  it("redacts 9-digit numbers", () => {
    expect(redactPII("my ssn is 123456789")).toBe("my ssn is [REDACTED]");
  });
  it("redacts dashed SSN format", () => {
    expect(redactPII("123-45-6789")).toBe("[REDACTED]");
  });
  it("redacts 4-digit number following ssn keyword", () => {
    expect(redactPII("last 4 of ssn is 1234")).toBe("last 4 of ssn is [REDACTED]");
    expect(redactPII("social: 9876")).toBe("social: [REDACTED]");
  });
  it("leaves ordinary 4-digit numbers alone", () => {
    expect(redactPII("my account ends 4321")).toBe("my account ends 4321");
  });
  it("redacts DOB-like strings", () => {
    expect(redactPII("born 04/12/1990")).toBe("born [REDACTED]");
    expect(redactPII("dob 1990-04-12")).toBe("dob [REDACTED]");
  });
  it("returns empty string for empty input", () => {
    expect(redactPII("")).toBe("");
  });
});
