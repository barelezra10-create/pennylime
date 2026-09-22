import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });
  const data = await req.json().catch(() => null);
  if (typeof data?.available !== "boolean" || typeof data?.sessionId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(data.sessionId)) return new Response("Invalid availability", { status: 400 });
  const result = await prisma.adminUser.updateMany({ where: { email: session.user.email, ...(!data.available ? { voiceSessionId: data.sessionId } : {}) }, data: { voiceAvailableUntil: data.available ? new Date(Date.now() + 65000) : null, ...(data.available ? { voiceSessionId: data.sessionId } : {}) } });
  if (data.available && !result.count) return new Response("Staff account not found", { status: 403 });
  return Response.json({ ok: true });
}
