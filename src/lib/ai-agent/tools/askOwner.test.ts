import { describe, it, expect, vi, beforeEach } from "vitest";

const recordOwnerQuestion = vi.fn();
vi.mock("@/lib/knowledge", () => ({
  recordOwnerQuestion: (...a: unknown[]) => recordOwnerQuestion(...a),
}));

import { askOwner } from "./askOwner";

const ctx = {
  channel: "chat",
  sessionId: "s1",
  authLevel: "anon",
  contactId: "c1",
  metadata: {},
} as const;

beforeEach(() => {
  recordOwnerQuestion.mockReset();
});

describe("askOwner", () => {
  it("calls recordOwnerQuestion with sessionId and question, returns success message", async () => {
    recordOwnerQuestion.mockResolvedValue("entry-1");
    const res = await askOwner.handler({ question: "What is the fee?" }, ctx);
    expect(recordOwnerQuestion).toHaveBeenCalledWith("s1", "What is the fee?");
    expect(res.status).toBe("ok");
    const data = (res as { status: "ok"; data: { message: string } }).data;
    expect(data.message).toContain("Question filed with the team");
    expect(data.message).toContain("Do not invent an answer");
  });

  it("returns apologetic message and does not throw when recordOwnerQuestion rejects", async () => {
    recordOwnerQuestion.mockRejectedValue(new Error("db down"));
    const res = await askOwner.handler({ question: "What is the fee?" }, ctx);
    expect(res.status).toBe("ok");
    const data = (res as { status: "ok"; data: { message: string } }).data;
    expect(data.message).toContain("Could not reach the team queue");
    expect(recordOwnerQuestion).toHaveBeenCalledWith("s1", "What is the fee?");
  });

  it("returns model-facing empty-question string without touching the DB when question is blank", async () => {
    for (const blank of ["", "   ", "\t\n"]) {
      recordOwnerQuestion.mockReset();
      const res = await askOwner.handler({ question: blank }, ctx);
      expect(res.status).toBe("ok");
      const data = (res as { status: "ok"; data: { message: string } }).data;
      expect(data.message).toBe("No question provided; ask the user to phrase their question.");
      expect(recordOwnerQuestion).not.toHaveBeenCalled();
    }
  });
});
