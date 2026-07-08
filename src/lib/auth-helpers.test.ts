import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
import { isSupportRole } from "./auth-helpers";

describe("isSupportRole", () => {
  it("only SUPPORT is restricted", () => {
    expect(isSupportRole("SUPPORT")).toBe(true);
    expect(isSupportRole("ADMIN")).toBe(false);
    expect(isSupportRole("REP")).toBe(false);
    expect(isSupportRole(undefined)).toBe(false);
    expect(isSupportRole(null)).toBe(false);
  });
});
