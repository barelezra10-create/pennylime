import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { normalizeQuestion, questionsMatch } from "./knowledge";

describe("normalizeQuestion", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeQuestion("  When do LATE fees start?! ")).toBe("when do late fees start");
  });
});

describe("questionsMatch", () => {
  it("matches identical normalized questions", () => {
    expect(questionsMatch("When do late fees start?", "when DO late fees start")).toBe(true);
  });
  it("matches when one contains the other (min length guard)", () => {
    expect(questionsMatch("late fees", "when do late fees start")).toBe(true);
  });
  it("does not match short or unrelated questions", () => {
    expect(questionsMatch("hi", "when do late fees start")).toBe(false);
    expect(questionsMatch("how do I change my bank", "when do late fees start")).toBe(false);
  });
});
