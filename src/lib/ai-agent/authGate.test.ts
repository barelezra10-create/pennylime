import { describe, it, expect } from "vitest";
import { meetsAuth } from "./authGate";

describe("meetsAuth", () => {
  it("anon is sufficient for anon-required tools", () => {
    expect(meetsAuth("anon", "anon")).toBe(true);
  });
  it("phone-matched satisfies anon and phone-matched", () => {
    expect(meetsAuth("phone-matched", "anon")).toBe(true);
    expect(meetsAuth("phone-matched", "phone-matched")).toBe(true);
  });
  it("verified satisfies everything", () => {
    expect(meetsAuth("verified", "anon")).toBe(true);
    expect(meetsAuth("verified", "phone-matched")).toBe(true);
    expect(meetsAuth("verified", "verified")).toBe(true);
  });
  it("anon does not satisfy verified", () => {
    expect(meetsAuth("anon", "verified")).toBe(false);
    expect(meetsAuth("phone-matched", "verified")).toBe(false);
  });
});
