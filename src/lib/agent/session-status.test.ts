import { describe, it, expect } from "vitest";
import { sessionDisplayStatus, isHandlingStatus } from "./session-status";

describe("sessionDisplayStatus", () => {
  const base = { handlingStatus: "OPEN", needsReply: false, hasMessages: true, ended: false };

  it("shows Needs reply when the customer sent the last message, even if marked resolved", () => {
    expect(sessionDisplayStatus({ ...base, needsReply: true, handlingStatus: "RESOLVED" }).kind).toBe(
      "needs_reply"
    );
  });

  it("auto-shows Waiting on client when we replied last (open, has messages, not ended)", () => {
    expect(sessionDisplayStatus({ ...base }).kind).toBe("waiting_client");
  });

  it("shows Resolved when admin set RESOLVED and no unanswered message", () => {
    const r = sessionDisplayStatus({ ...base, handlingStatus: "RESOLVED" });
    expect(r.kind).toBe("resolved");
    expect(r.label).toBe("Resolved");
  });

  it("falls back to no_messages for an empty open session", () => {
    expect(sessionDisplayStatus({ ...base, hasMessages: false }).kind).toBe("no_messages");
  });

  it("falls back to ended for an open session that has ended", () => {
    expect(sessionDisplayStatus({ ...base, ended: true }).kind).toBe("ended");
  });

  it("needs_reply still wins over the auto waiting_client when the customer messaged last", () => {
    expect(sessionDisplayStatus({ ...base, needsReply: true }).kind).toBe("needs_reply");
  });
});

describe("isHandlingStatus", () => {
  it("accepts valid statuses", () => {
    expect(isHandlingStatus("OPEN")).toBe(true);
    expect(isHandlingStatus("WAITING_CLIENT")).toBe(true);
    expect(isHandlingStatus("RESOLVED")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isHandlingStatus("DONE")).toBe(false);
    expect(isHandlingStatus(null)).toBe(false);
    expect(isHandlingStatus(123)).toBe(false);
  });
});
