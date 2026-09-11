import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ send: vi.fn(), event: vi.fn(), activity: vi.fn() }));
vi.mock("@/lib/email", () => ({ FROM_EMAIL: "test@example.com", getResend: () => ({ emails: { send: m.send } }) }));
vi.mock("@/lib/emails/branded-wrapper", () => ({ wrapTransactionalEmail: (html: string) => html }));
vi.mock("@/lib/db", () => ({ prisma: { emailEvent: { create: m.event }, activity: { create: m.activity } } }));
import { sendEmail } from "./send";
beforeEach(() => vi.resetAllMocks());
describe("contract email delivery reporting", () => {
  it("treats a provider error response as failure rather than a sent email", async () => {
    m.send.mockResolvedValue({ data: null, error: { message: "Rejected" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendEmail({ to: "test@example.com", subject: "Contract", html: "test", contactId: "contact" });
    expect(result.success).toBe(false);
    expect(m.event).not.toHaveBeenCalled();
    expect(m.activity).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "email_failed" }) }));
    spy.mockRestore();
  });
  it("records a successful provider message ID", async () => {
    m.send.mockResolvedValue({ data: { id: "message-id" }, error: null });
    expect(await sendEmail({ to: "test@example.com", subject: "Contract", html: "test" })).toEqual({ success: true, id: "message-id" });
  });
});
