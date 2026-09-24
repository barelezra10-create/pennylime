import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

const source = readFileSync(new URL("./inbound-email-forwarder.gs", import.meta.url), "utf8");
function message(id: string, overrides = {}) {
  return {
    getId: () => id, getDate: () => new Date(), isDraft: () => false, isInTrash: () => false,
    getTo: () => "info@pennylime.com", getCc: () => "", getFrom: () => "Client <client@example.com>",
    getHeader: () => "", isUnread: () => false, markRead: vi.fn(), ...overrides,
  };
}
function harness(messages: ReturnType<typeof message>[], results = [true]) {
  const state: Record<string, string> = { INBOUND_EMAIL_SECRET: "secret" };
  const properties = {
    getProperty: (key: string) => state[key] || null,
    getProperties: () => ({ ...state }),
    setProperty: (key: string, value: string) => { state[key] = value; },
    deleteProperty: (key: string) => { delete state[key]; },
  };
  const search = vi.fn((_query: string, offset: number, size: number) => messages.slice(offset, offset + size).map(m => ({ getMessages: () => [m] })));
  const forward = vi.fn((_message: ReturnType<typeof message>, _secret: string) => results.length > 1 ? results.shift() : results[0]);
  const release = vi.fn();
  const context = { PropertiesService: { getScriptProperties: () => properties }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: release }) }, GmailApp: { search }, console: { log: vi.fn(), error: vi.fn() }, forward };
  runInNewContext(source + "\nforwardMessage_ = forward;", context);
  return { state, search, forward, release, run: () => runInNewContext("checkInbox()", context) };
}
it("imports replies already read in Gmail without changing read state", () => {
  const msg = message("read-message");
  const h = harness([msg]); h.run();
  expect(h.search.mock.calls[0][0]).not.toContain("is:unread");
  expect(h.forward).toHaveBeenCalledWith(msg, "secret");
  expect(msg.markRead).not.toHaveBeenCalled();
  expect(h.state.INBOUND_LAST_SCAN_AT).toBeTruthy();
});
it("skips only successfully imported messages on later scans", () => {
  const h = harness([message("one")]); h.run(); h.run();
  expect(h.forward).toHaveBeenCalledTimes(1);
});
it("retries failed messages without advancing the checkpoint", () => {
  const h = harness([message("retry")], [false, true]); h.run();
  expect(h.state.INBOUND_LAST_SCAN_AT).toBeUndefined();
  expect(h.state.INBOUND_FORWARDED_retry).toBeUndefined();
  h.run();
  expect(h.forward).toHaveBeenCalledTimes(2);
  expect(h.state.INBOUND_FORWARDED_retry).toBeTruthy();
  expect(h.release).toHaveBeenCalledTimes(2);
});
it("imports replies beyond the first 25 threads", () => {
  const h = harness(Array.from({ length: 26 }, (_, i) => message(String(i)))); h.run();
  expect(h.forward).toHaveBeenCalledTimes(26);
  expect(h.search.mock.calls.map(c => c[1])).toEqual([0, 25]);
});
it("excludes outbound messages and drafts included in Gmail threads", () => {
  const h = harness([
    message("outbound", { getTo: () => "client@example.com", getFrom: () => "info@pennylime.com" }),
    message("draft", { isDraft: () => true }),
    message("other", { getTo: () => "other@example.com" }),
    message("reply"),
  ]); h.run();
  expect(h.forward).toHaveBeenCalledTimes(1);
  expect(h.forward.mock.calls[0][0].getId()).toBe("reply");
});
it("catches replies delivered via cc or delivered-to", () => {
  const h = harness([
    message("cc", { getTo: () => "other@example.com", getCc: () => "PennyLime <info@pennylime.com>" }),
    message("delivered", { getTo: () => "other@example.com", getHeader: () => "info@pennylime.com" }),
  ]); h.run(); expect(h.forward).toHaveBeenCalledTimes(2);
});
