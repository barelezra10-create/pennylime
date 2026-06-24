import { describe, it, expect } from "vitest";
import { sessionDisplayStatus, isHandlingStatus } from "./session-status";

describe("sessionDisplayStatus", () => {
  const base = { handlingStatus: "OPEN", needsReply: false, hasMessages: true, ended: false };

  it("shows Needs reply when the customer sent the last message, even if marked resolved", () => {
    expect(sessionDisplayStatus({ ...base, needsReply: true, handlingStatus: "RESOLVED" }).kind).toBe(
      "needs_reply"
    );
  });

  it("shows Waiting on client when admin set WAITING_CLIENT and no unanswered message", () => {
    expect(sessionDisplayStatus({ ...base, handlingStatus: "WAITING_CLIENT" }).kind).toBe(
      "waiting_client"
    );
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

  it("falls back to caught_up for an open session with messages, nothing outstanding", () => {
    expect(sessionDisplayStatus(base).kind).toBe("caught_up");
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
