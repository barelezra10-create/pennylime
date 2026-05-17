import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok"] as const;

export default async function SocialSchedulePage() {
  // Show next 14 days of expected topics. The LRU picker orders by:
  //   1. lastUsedAt asc (null first)
  //   2. useCount asc
  // So we can preview the queue with the same ordering.
  const upcoming = await prisma.topicPool.findMany({
    where: { active: true },
    orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }, { useCount: "asc" }],
    take: 14,
  });

  // Today's published posts to show "already done"
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysPosts = await prisma.socialPost.findMany({
    where: { createdAt: { gte: today } },
    include: { account: true },
    orderBy: { createdAt: "desc" },
  });

  // Build a date list for the next 14 days (starting tomorrow, since the
  // cron fires at 15:00 UTC daily; if today's already published we start
  // tomorrow, otherwise today)
  const todayHasPosts = todaysPosts.some((p) => p.status === "published");
  const startOffset = todayHasPosts ? 1 : 0;
  const scheduledDates = upcoming.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + startOffset + i);
    d.setHours(15, 0, 0, 0);
    return d;
  });

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <p className="text-sm text-gray-600 mt-1">
          The next 14 posts in queue order (LRU: least-recently-used topics first).
          Each row publishes to all 4 platforms at 15:00 UTC.
        </p>
      </div>

      {todaysPosts.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Today</h2>
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {PLATFORMS.map((platform) => {
                const post = todaysPosts.find((p) => p.account.platform === platform);
                if (!post) {
                  return (
                    <div key={platform} className="text-sm">
                      <div className="text-xs uppercase text-gray-500 mb-1">{platform}</div>
                      <div className="text-gray-400 italic">no post</div>
                    </div>
                  );
                }
                const statusColor =
                  post.status === "published" ? "bg-green-100 text-green-800"
                  : post.status === "blocked" ? "bg-gray-100 text-gray-700"
                  : post.status === "failed" ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800";
                return (
                  <div key={platform} className="text-sm">
                    <div className="text-xs uppercase text-gray-500 mb-1">{platform}</div>
                    <div className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor} mb-1`}>
                      {post.status}
                    </div>
                    <div className="font-medium text-sm line-clamp-2">{post.topic}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">Upcoming</h2>
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 w-32">Date (UTC)</th>
                <th className="px-4 py-3 w-24">Category</th>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3 w-16 text-right">Used</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((t, i) => {
                const isIntro = t.category === "intro";
                return (
                  <tr key={t.id} className={`border-t ${isIntro ? "bg-green-50" : ""}`}>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {scheduledDates[i].toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${isIntro ? "bg-green-200 text-green-900" : "bg-gray-100 text-gray-700"}`}>
                        {t.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{t.topic}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{t.useCount}</td>
                  </tr>
                );
              })}
              {upcoming.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                    No active topics. Add some at <a href="/admin/social/topics" className="text-blue-600 underline">/admin/social/topics</a>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Order: least-recently-used first, then lowest use count. Rows highlighted green are intro/&quot;who we are&quot; topics, which publish first.
        </p>
      </section>
    </div>
  );
}
