import { NextRequest } from "next/server";
import { runTurn } from "@/lib/ai-agent/runTurn";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();
  const sessionId = String(body.sessionId ?? randomUUID());
  if (!text) return Response.json({ error: "text required" }, { status: 400 });
  if (text.length > 2000) return Response.json({ error: "too long" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  try {
    const out = await runTurn(text, {
      channel: "chat",
      sessionId,
      authLevel: "anon",
      metadata: { ip: ip ?? undefined, userAgent },
    });
    return Response.json({ sessionId, reply: out.reply, newAuthLevel: out.newAuthLevel ?? null });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "agent error" }, { status: 500 });
  }
}
