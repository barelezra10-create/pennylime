export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SupportShell } from "./support-shell";

export default async function SupportPage() {
  const session = await getServerSession(authOptions);
  const me = session?.user?.email ?? null;
  return <SupportShell me={me} />;
}
