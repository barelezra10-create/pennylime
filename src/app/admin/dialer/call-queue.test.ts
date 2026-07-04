import { describe, it, expect } from "vitest";
import { buildCallQueue, type QueueContact } from "./call-queue";

const c = (id: string, stage: string, phone: string | null): QueueContact => ({ id, stage, phone });

describe("buildCallQueue", () => {
  const all = [
    c("r1", "REPAYING", "+15550000001"),
    c("l1", "LATE", "+15550000002"),
    c("lead", "LEAD", "+15550000003"),
    c("l2", "LATE", null),
    c("l3", "LATE", "+15550000004"),
  ];

  it("defaults to LATE then REPAYING, skipping missing phones", () => {
    expect(buildCallQueue(all, false, []).map((x) => x.id)).toEqual(["l1", "l3", "r1"]);
  });

  it("uses the filtered list in display order when a filter is active", () => {
    const filtered = [all[2], all[0], all[3]];
    expect(buildCallQueue(all, true, filtered).map((x) => x.id)).toEqual(["lead", "r1"]);
  });
});
