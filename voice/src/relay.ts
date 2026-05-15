import type { WebSocket } from "ws";
import { runTurn } from "../../src/lib/ai-agent/runTurn";
import { prisma } from "./db";

type SetupEvent = { type: "setup"; callSid: string; from: string; to: string };
type PromptEvent = { type: "prompt"; voicePrompt: string };
type InterruptEvent = { type: "interrupt" };
type DtmfEvent = { type: "dtmf"; digit: string };
type HangupEvent = { type: "hangup" };
type RelayInbound = SetupEvent | PromptEvent | InterruptEvent | DtmfEvent | HangupEvent;

export async function handleConnection(ws: WebSocket): Promise<void> {
  let sessionId = "";
  let contactId: string | undefined;
  let dtmfBuffer = "";

  ws.on("message", async (raw) => {
    let msg: RelayInbound;
    try { msg = JSON.parse(raw.toString()) as RelayInbound; } catch { return; }

    if (msg.type === "setup") {
      sessionId = `voice:${msg.callSid}`;
      const phone = msg.from.replace(/^\+1/, "");
      const candidates = [msg.from, phone, "+1" + phone];
      const c = await prisma.contact.findFirst({ where: { phone: { in: candidates } } });
      contactId = c?.id;
      return;
    }

    if (msg.type === "dtmf") {
      dtmfBuffer += msg.digit;
      if (dtmfBuffer.length >= 4) {
        const text = `dob digits ${dtmfBuffer}`;
        dtmfBuffer = "";
        const out = await runTurn(text, {
          channel: "voice",
          sessionId,
          contactId,
          authLevel: contactId ? "phone-matched" : "anon",
          metadata: {},
        });
        ws.send(JSON.stringify({ type: "text", token: out.reply, last: true }));
      }
      return;
    }

    if (msg.type === "prompt") {
      const out = await runTurn(msg.voicePrompt, {
        channel: "voice",
        sessionId,
        contactId,
        authLevel: contactId ? "phone-matched" : "anon",
        metadata: {},
      });
      ws.send(JSON.stringify({ type: "text", token: out.reply, last: true }));
      return;
    }

    if (msg.type === "interrupt") {
      return;
    }

    if (msg.type === "hangup") {
      if (sessionId) {
        await prisma.agentSession.update({
          where: { id: sessionId },
          data: { endedAt: new Date(), endReason: "hangup" },
        }).catch(() => {});
      }
      ws.close();
      return;
    }
  });

  ws.on("close", async () => {
    if (sessionId) {
      await prisma.agentSession.update({
        where: { id: sessionId },
        data: { endedAt: new Date(), endReason: "hangup" },
      }).catch(() => {});
    }
  });
}
