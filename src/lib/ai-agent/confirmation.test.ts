import { describe, it, expect, vi } from "vitest";
import { issueToken, verifyToken } from "./confirmation";

describe("confirmation token", () => {
  it("verifies a fresh token for the same payload", () => {
    const tok = issueToken("sess1", "schedulePayment", { amount: 100, date: "2026-05-20" });
    expect(verifyToken(tok, "sess1", "schedulePayment", { amount: 100, date: "2026-05-20" })).toBe(true);
  });
  it("rejects token with different payload", () => {
    const tok = issueToken("sess1", "schedulePayment", { amount: 100, date: "2026-05-20" });
    expect(verifyToken(tok, "sess1", "schedulePayment", { amount: 200, date: "2026-05-20" })).toBe(false);
  });
  it("rejects expired token (>90s old)", () => {
    vi.useFakeTimers();
    const tok = issueToken("sess1", "schedulePayment", { amount: 100, date: "2026-05-20" });
    vi.advanceTimersByTime(91_000);
    expect(verifyToken(tok, "sess1", "schedulePayment", { amount: 100, date: "2026-05-20" })).toBe(false);
    vi.useRealTimers();
  });
  it("rejects a token replayed from a different session", () => {
    const tok = issueToken("sessA", "schedulePayment", { amount: 100, date: "2026-05-20" });
    expect(verifyToken(tok, "sessB", "schedulePayment", { amount: 100, date: "2026-05-20" })).toBe(false);
  });
  it("rejects a token with a forged future timestamp", () => {
    const tok = issueToken("sessA", "schedulePayment", { amount: 100, date: "2026-05-20" });
    const [, digest] = tok.split(".");
    const forged = `${(Date.now() + 60_000).toString(36)}.${digest}`;
    expect(verifyToken(forged, "sessA", "schedulePayment", { amount: 100, date: "2026-05-20" })).toBe(false);
  });
  it("round-trip: token issued at denial verifies on confirmation", () => {
    const payload = { amount: 100, date: "2026-05-20" };
    const tok = issueToken("sessA", "schedulePayment", payload);
    expect(verifyToken(tok, "sessA", "schedulePayment", payload)).toBe(true);
  });
});
