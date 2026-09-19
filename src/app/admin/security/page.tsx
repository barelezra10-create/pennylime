import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordRetentionDecision } from "@/actions/security-controls";
import { CLOSED_STATUSES } from "@/lib/security/retention-policy";
export const dynamic = "force-dynamic";
export default async function SecurityControlsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/admin/login");
  if ((session.user as { role?: string }).role !== "ADMIN") redirect("/admin/dashboard");
  const [users, closed, reviews, latest] = await Promise.all([
    prisma.adminUser.findMany({ select: { id: true, email: true, role: true, _count: { select: { passkeys: true } } } }),
    prisma.application.findMany({ where: { status: { in: CLOSED_STATUSES } }, select: { id: true, applicationCode: true, status: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.retentionCase.findMany(),
    prisma.securityReview.findFirst({ where: { kind: "RETENTION_DAILY" }, orderBy: { createdAt: "desc" } }),
  ]);
  return <main className="mx-auto max-w-5xl space-y-8 p-6">
    <h1 className="text-2xl font-bold">Security controls</h1>
    <section className="rounded-xl border p-5 space-y-3"><h2 className="text-lg font-semibold">Administrator MFA</h2>
      <p>Mandatory enrollment: {process.env.ADMIN_MFA_REQUIRED === "true" ? "Enabled" : "Pending rollout"}. Enrolled accounts always require a passkey.</p>
      {users.map(u => <p key={u.id}>{u.email} ({u.role}): {u._count.passkeys ? "Passkey enrolled" : "Enrollment needed"}</p>)}
    </section>
    <section className="rounded-xl border p-5 space-y-3"><h2 className="text-lg font-semibold">Retention monitoring</h2>
      <p>Token revocation: {process.env.RETENTION_REVOKE_ENABLED === "true" ? "Enabled for reviewed, eligible cases" : "Report only"}.</p>
      <p>Last scheduled review: {latest?.createdAt.toISOString() ?? "No run recorded"}</p>
      {latest && <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(JSON.parse(latest.summary), null, 2)}</pre>}
      <p>Confirm relationship end dates from records. Legal holds block token removal. Active related advances also block revocation. Historical agreements and payment records are preserved for separate retention review.</p>
    </section>
    <section className="space-y-4"><h2 className="text-lg font-semibold">Closed applications: retention review (latest 100)</h2>
    {closed.map(a => { const review = reviews.find(r => r.applicationId === a.id); return <form action={recordRetentionDecision} key={a.id} className="rounded-xl border p-4 space-y-3">
      <h3 className="font-semibold">{a.applicationCode} - {a.status}</h3><input type="hidden" name="applicationId" value={a.id}/>
      <label className="block">Verified relationship end date <input className="border p-1" type="date" name="endedAt" defaultValue={review?.relationshipEndedAt?.toISOString().slice(0,10)} /></label>
      <label className="block"><input type="checkbox" name="legalHold" defaultChecked={review?.legalHold}/> Legal hold</label>
      <label className="block">Hold reason <input className="border p-1" name="holdReason" defaultValue={review?.holdReason ?? ""}/></label>
      <p className="text-sm">Plaid revoked: {review?.plaidRevokedAt?.toISOString() ?? "Not recorded"}</p>
      <button className="rounded bg-black px-4 py-2 text-white">Save review</button>
    </form>; })}</section>
  </main>;
}
