import { describe, it, expect, vi, beforeEach } from "vitest";

const findContact = vi.fn();
const findVerif = vi.fn();
const upsertVerif = vi.fn();
const updateVerif = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    contact: { findUnique: (...a: unknown[]) => findContact(...a) },
    agentVerification: {
      findUnique: (...a: unknown[]) => findVerif(...a),
      upsert: (...a: unknown[]) => upsertVerif(...a),
      update: (...a: unknown[]) => updateVerif(...a),
    },
  },
}));

import { verifyIdentity } from "./verifyIdentity";

const ctx = { channel: "sms", sessionId: "s1", contactId: "c1", authLevel: "phone-matched", metadata: {} } as const;

beforeEach(() => {
  findContact.mockReset();
  findVerif.mockReset();
  upsertVerif.mockReset();
  updateVerif.mockReset();
});

describe("verifyIdentity", () => {
  it("returns verified=true on DOB match", async () => {
    findContact.mockResolvedValue({ id: "c1", application: { dateOfBirth: "1990-04-12" } });
    findVerif.mockResolvedValue(null);
    upsertVerif.mockResolvedValue({});
    const res = await verifyIdentity.handler({ dob: "1990-04-12" }, ctx);
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect((res.data as { verified: boolean }).verified).toBe(true);
  });
  it("rejects on DOB mismatch and increments attempts", async () => {
    findContact.mockResolvedValue({ id: "c1", application: { dateOfBirth: "1990-04-12" } });
    findVerif.mockResolvedValue({ attempts: 0, lockedUntil: null });
    upsertVerif.mockResolvedValue({});
    const res = await verifyIdentity.handler({ dob: "1991-01-01" }, ctx);
    if (res.status !== "ok") return;
    expect((res.data as { verified: boolean }).verified).toBe(false);
    expect(upsertVerif).toHaveBeenCalled();
  });
  it("returns locked after 3 attempts in 24h", async () => {
    findContact.mockResolvedValue({ id: "c1", application: { dateOfBirth: "1990-04-12" } });
    findVerif.mockResolvedValue({ attempts: 3, lockedUntil: new Date(Date.now() + 60_000) });
    const res = await verifyIdentity.handler({ dob: "1990-04-12" }, ctx);
    if (res.status !== "ok") return;
    expect((res.data as { verified: boolean; locked?: boolean }).locked).toBe(true);
  });
  it("returns verified=false when contact has no contactId in ctx", async () => {
    const ctxAnon = { ...ctx, contactId: undefined } as const;
    const res = await verifyIdentity.handler({ dob: "1990-04-12" }, ctxAnon);
    if (res.status !== "ok") return;
    expect((res.data as { verified: boolean }).verified).toBe(false);
  });

  it("does not instantly re-lock after a 24h lock has expired", async () => {
    findContact.mockResolvedValue({ id: "c1", application: { dateOfBirth: "1990-04-12" } });
    // attempts=3 left over from yesterday, lock window already passed
    findVerif.mockResolvedValue({ attempts: 3, lockedUntil: new Date(Date.now() - 60_000) });
    upsertVerif.mockResolvedValue({});
    const res = await verifyIdentity.handler({ dob: "1991-01-01" }, ctx);
    if (res.status !== "ok") return;
    const data = res.data as { verified: boolean; locked?: boolean };
    expect(data.verified).toBe(false);
    expect(data.locked).toBe(false);
    // upsert should reset the counter and store attempts=1, not lock
    const call = upsertVerif.mock.calls[0][0];
    expect(call.update.attempts).toBe(1);
    expect(call.update.lockedUntil).toBeNull();
  });

  it("normalizes M/D/YYYY input to match stored YYYY-MM-DD", async () => {
    findContact.mockResolvedValue({ id: "c1", application: { dateOfBirth: "1990-04-12" } });
    findVerif.mockResolvedValue(null);
    upsertVerif.mockResolvedValue({});
    const res = await verifyIdentity.handler({ dob: "4/12/1990" }, ctx);
    if (res.status !== "ok") return;
    expect((res.data as { verified: boolean }).verified).toBe(true);
  });
});

import { normalizeDob } from "./verifyIdentity";

describe("normalizeDob", () => {
  it("ISO YYYY-MM-DD passes through", () => {
    expect(normalizeDob("1990-04-12")).toBe("1990-04-12");
  });
  it("zero-pads M/D/YYYY", () => {
    expect(normalizeDob("4/12/1990")).toBe("1990-04-12");
    expect(normalizeDob("4-12-1990")).toBe("1990-04-12");
  });
  it("expands 2-digit year as DOB (>=30 -> 19xx, <30 -> 20xx)", () => {
    expect(normalizeDob("4/12/90")).toBe("1990-04-12");
    expect(normalizeDob("4/12/05")).toBe("2005-04-12");
  });
  it("'June 16, 1979' -> 1979-06-16", () => {
    expect(normalizeDob("June 16, 1979")).toBe("1979-06-16");
  });
  it("'June 16th 1979' (ordinal suffix) -> 1979-06-16", () => {
    expect(normalizeDob("June 16th 1979")).toBe("1979-06-16");
  });
  it("'Jul/17/1986' -> 1986-07-17", () => {
    expect(normalizeDob("Jul/17/1986")).toBe("1986-07-17");
  });
  it("'Jul 17 1986' -> 1986-07-17", () => {
    expect(normalizeDob("Jul 17 1986")).toBe("1986-07-17");
  });
  it("case-insensitive month names", () => {
    expect(normalizeDob("DECEMBER 1, 2000")).toBe("2000-12-01");
  });
  it("returns trimmed garbage unchanged when unparseable", () => {
    expect(normalizeDob("garbage")).toBe("garbage");
  });
});
