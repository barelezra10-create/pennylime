import { describe, it, expect } from "vitest";
import { phoneCandidates } from "./phone";

describe("phoneCandidates", () => {
  it("expands an E.164 US number into stored-format variants", () => {
    expect(phoneCandidates("+15551234567")).toEqual(
      expect.arrayContaining(["+15551234567", "15551234567", "5551234567"])
    );
  });

  it("returns an empty array for empty input", () => {
    expect(phoneCandidates("")).toEqual([]);
    expect(phoneCandidates(null)).toEqual([]);
  });
});
