import { prisma } from "@/lib/db";
import { PublishReelButton } from "./publish-reel-button";

export const dynamic = "force-dynamic";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function SocialAdminPage() {
  const today = startOfToday();

  const [accounts, todayPosts, engagementGroups] = await Promise.all([
    prisma.socialAccount.findMany({ orderBy: { platform: "asc" } }),

    prisma.socialPost.findMany({
      where: { createdAt: { gte: today } },
      include: { account: true },
      orderBy: { createdAt: "desc" },
    }),

    prisma.engagementLog.groupBy({
      by: ["platform", "action"],
      where: { createdAt: { gte: today }, success: true },
      _count: true,
    }),
  ]);

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Social Bot</h1>
          <p className="mt-1 text-sm text-gray-500">
            Read-only overview — account health, today&apos;s posts, and engagement counts.
          </p>
        </div>
        <PublishReelButton />
      </div>

      {/* ── Section 1: Account Health ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Account Health</h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wide text-xs">
                  Platform
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wide text-xs">
                  Handle
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wide text-xs">
                  Access Token
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wide text-xs">
                  Bot Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wide text-xs">
                  Last Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No accounts configured.
                  </td>
                </tr>
              ) : (
                accounts.map((acct) => {
                  const hasToken = Boolean(acct.accessToken);
                  const unhealthy = acct.botStatus !== "healthy" || !hasToken;
                  return (
                    <tr
                      key={acct.id}
                      className={unhealthy ? "bg-red-50" : "bg-white hover:bg-gray-50"}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 capitalize">
                        {acct.platform}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{acct.handle}</td>
                      <td className="px-4 py-3">
                        {hasToken ? (
                          <span className="text-green-600 font-semibold">&#10003;</span>
                        ) : (
                          <span className="text-red-500 font-semibold">&#10007; no token</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            acct.botStatus === "healthy"
                              ? "bg-green-100 text-green-700"
                              : acct.botStatus === "challenged"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {acct.botStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {acct.lastBotAction
                          ? acct.lastBotAction.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 2: Today's Posts ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">
          Today&apos;s Posts{" "}
          <span className="text-gray-400 font-normal text-sm">({todayPosts.length})</span>
        </h2>

        {todayPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
            No posts yet today.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {todayPosts.map((post) => {
              const isProblematic = post.status === "blocked" || post.status === "failed";
              return (
                <div
                  key={post.id}
                  className={`rounded-xl border bg-white p-4 shadow-sm ${
                    isProblematic ? "border-red-200" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-500 capitalize">
                      {post.account.platform} &middot; {post.account.handle}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        post.status === "published"
                          ? "bg-green-100 text-green-700"
                          : post.status === "pending"
                          ? "bg-blue-100 text-blue-700"
                          : post.status === "blocked"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {post.status}
                    </span>
                  </div>

                  <p className="text-sm font-medium text-gray-800 truncate">{post.topic}</p>

                  <p className="mt-1 text-xs text-gray-500">
                    Scheduled:{" "}
                    {post.scheduledFor.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>

                  {isProblematic && post.publishError && (
                    <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600 break-words">
                      {post.publishError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 3: Today's Engagement Counts ── */}
      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">
          Today&apos;s Engagement
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wide text-xs">
                  Platform
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wide text-xs">
                  Action
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wide text-xs">
                  Count (success)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {engagementGroups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                    No engagement actions recorded today.
                  </td>
                </tr>
              ) : (
                engagementGroups.map((row, i) => (
                  <tr key={i} className="bg-white hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 capitalize">{row.platform}</td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{row.action}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{row._count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Section 4: Kill Switch ── */}
      <section>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-800 mb-1">Kill Switch</h2>
          <p className="text-sm text-amber-700 leading-relaxed">
            To stop the bot immediately, set{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-900">
              SOCIAL_BOT_ENABLED=false
            </code>{" "}
            in Railway environment variables and redeploy (or trigger a restart). The cron
            jobs check this flag on every execution, so the bot will stop within the next
            scheduled cycle (~5 minutes). To resume, set the value back to{" "}
            <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-900">
              true
            </code>
            .
          </p>
          <p className="mt-2 text-xs text-amber-600">
            This dashboard is read-only. There is no in-app toggle.
          </p>
        </div>
      </section>
    </div>
  );
}
