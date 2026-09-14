import { describe, expect, it, vi } from "vitest";
import { sendCallDigit } from "./dtmf";
describe("in-call tones", () => {
  it.each("0123456789*#".split(""))("sends %s unchanged to the connected call", (digit) => {
    const call = { status: () => "open", sendDigits: vi.fn() };
    expect(sendCallDigit(call, digit)).toBe(true);
    expect(call.sendDigits).toHaveBeenCalledExactlyOnceWith(digit);
  });
  it.each(["pending", "connecting", "ringing", "closed"])("does not send in %s state", (status) => {
    const call = { status: () => status, sendDigits: vi.fn() };
    expect(sendCallDigit(call, "1")).toBe(false);
    expect(call.sendDigits).not.toHaveBeenCalled();
  });
  it.each(["", "12", "w", "a", "+", "\n"])("rejects invalid key %j", (digit) => {
    const call = { status: () => "open", sendDigits: vi.fn() };
    expect(sendCallDigit(call, digit)).toBe(false);
    expect(call.sendDigits).not.toHaveBeenCalled();
  });
  it("does nothing after the call reference is cleared", () => {
    expect(sendCallDigit(null, "#")).toBe(false);
  });
});
