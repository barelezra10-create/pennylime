import { describe, it, expect } from "vitest";
import { dialedDigits, formatDialed, dialedToE164 } from "./dialpad";

describe("dialedDigits", () => {
  it("strips non-digits and caps at 11", () => {
    expect(dialedDigits("(555) 123-4567")).toBe("5551234567");
    expect(dialedDigits("+1 555 123 4567 999")).toBe("15551234567");
    expect(dialedDigits("abc")).toBe("");
  });
});

describe("formatDialed", () => {
  it("formats progressively as (XXX) XXX-XXXX", () => {
    expect(formatDialed("")).toBe("");
    expect(formatDialed("555")).toBe("(555");
    expect(formatDialed("5551")).toBe("(555) 1");
    expect(formatDialed("5551234567")).toBe("(555) 123-4567");
  });

  it("shows a leading 1 as +1 prefix", () => {
    expect(formatDialed("15551234567")).toBe("+1 (555) 123-4567");
  });
});

describe("dialedToE164", () => {
  it("returns E.164 for complete US numbers", () => {
    expect(dialedToE164("5551234567")).toBe("+15551234567");
    expect(dialedToE164("15551234567")).toBe("+15551234567");
  });

  it("returns null for incomplete numbers", () => {
    expect(dialedToE164("555123")).toBeNull();
    expect(dialedToE164("")).toBeNull();
  });
});
