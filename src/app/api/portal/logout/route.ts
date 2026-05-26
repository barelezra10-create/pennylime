import { signOutPortal } from "@/lib/portal-auth";

export async function POST() {
  await signOutPortal();
  return Response.json({ ok: true });
}
