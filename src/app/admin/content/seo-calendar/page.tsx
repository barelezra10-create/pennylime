import { prisma } from "@/lib/db";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { PlanMonthButton, ArticleRowActions } from "./row-actions";
import { getEveryOtherDayDates } from "@/lib/seo-calendar";

export const dynamic = "force-dynamic";

export default async function SeoCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const today = new Date();
  const year = sp.year ? Number(sp.year) : today.getUTCFullYear();
  const month = sp.month ? Number(sp.month) : today.getUTCMonth() + 1;

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const articles = await prisma.article.findMany({
    where: { scheduledFor: { gte: start, lt: end } },
    orderBy: { scheduledFor: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      scheduledFor: true,
      published: true,
      contentGenerated: true,
      publishedAt: true,
    },
  });

  const allTargetDates = getEveryOtherDayDates(year, month);
  // For display, also include past dates in the month (already-published
  // articles + missed slots) so admin can see history.
  const allMonthDates: Date[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d += 2) {
    allMonthDates.push(new Date(Date.UTC(year, month - 1, d, 14, 0, 0)));
  }

  const byDayKey = new Map<string, typeof articles[number]>();
  for (const a of articles) {
    if (!a.scheduledFor) continue;
    byDayKey.set(a.scheduledFor.toISOString().slice(0, 10), a);
  }

  const filledCount = articles.length;
  const remainingCount = allTargetDates.length - filledCount;
  const generatedCount = articles.filter((a) => a.contentGenerated).length;
  const publishedCount = articles.filter((a) => a.published).length;

  const monthName = new Date(year, month - 1).toLocaleString("en-US", { month: "long" });

  // Prev/next month navigation
  const prevDate = new Date(year, month - 2, 1);
  const nextDate = new Date(year, month, 1);
  const prevHref = `?year=${prevDate.getFullYear()}&month=${prevDate.getMonth() + 1}`;
  const nextHref = `?year=${nextDate.getFullYear()}&month=${nextDate.getMonth() + 1}`;

  return (
    <div>
      <PageHeader
        title="SEO Calendar"
        description={`Auto-planned blog articles for ${monthName} ${year}. Posts every other day.`}
      />

      {/* Month navigator + Plan button */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href={prevHref}
          className="rounded-lg bg-white border border-[#e4e4e7] px-3 py-1.5 text-[13px] font-semibold text-[#71717a] hover:bg-gray-50"
        >
          ← Prev month
        </Link>
        <Link
          href={nextHref}
          className="rounded-lg bg-white border border-[#e4e4e7] px-3 py-1.5 text-[13px] font-semibold text-[#71717a] hover:bg-gray-50"
        >
          Next month →
        </Link>
        <span className="mx-1 h-5 w-px bg-[#e4e4e7]" />

        {remainingCount > 0 && (
          <PlanMonthButton year={year} month={month} remainingCount={remainingCount} />
        )}

        <div className="ml-auto flex items-center gap-3 text-[12px] text-[#71717a]">
          <span>
            <strong className="text-[#0a0a0a]">{publishedCount}</strong> published
          </span>
          <span>·</span>
          <span>
            <strong className="text-[#0a0a0a]">{generatedCount - publishedCount}</strong> drafted, awaiting publish
          </span>
          <span>·</span>
          <span>
            <strong className="text-[#0a0a0a]">{filledCount - generatedCount}</strong> planned, body not yet written
          </span>
          {remainingCount > 0 && (
            <>
              <span>·</span>
              <span>
                <strong className="text-[#dc2626]">{remainingCount}</strong> open slots
              </span>
            </>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {allMonthDates.map((date) => {
          const key = date.toISOString().slice(0, 10);
          const a = byDayKey.get(key);
          const isPast = date < today;
          const isToday = key === today.toISOString().slice(0, 10);
          if (!a) {
            return (
              <div
                key={key}
                className={`rounded-xl border-2 border-dashed p-4 ${isPast ? "border-[#f4f4f5] bg-[#fafafa]" : "border-[#e4e4e7] bg-white"}`}
              >
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] font-bold mb-1">
                  {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {isToday && <span className="ml-2 text-[#15803d]">TODAY</span>}
                </p>
                <p className="text-[13px] text-[#a1a1aa] italic">
                  {isPast ? "No article was planned for this slot." : "Open slot — plan to fill."}
                </p>
              </div>
            );
          }
          return (
            <article
              key={a.id}
              className={`rounded-xl border p-4 ${
                a.published
                  ? "border-[#dcfce7] bg-[#f7fbf8]"
                  : a.contentGenerated
                    ? "border-[#fef3c7] bg-[#fffbeb]"
                    : "border-[#e4e4e7] bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[11px] uppercase tracking-[0.05em] text-[#71717a] font-bold">
                  {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {isToday && <span className="ml-2 text-[#15803d]">TODAY</span>}
                </p>
                <span
                  className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    a.published
                      ? "bg-[#15803d] text-white"
                      : a.contentGenerated
                        ? "bg-[#fef3c7] text-[#92400e]"
                        : "bg-[#f4f4f5] text-[#71717a]"
                  }`}
                >
                  {a.published ? "Published" : a.contentGenerated ? "Drafted" : "Planned"}
                </span>
              </div>
              <Link href={`/admin/content/articles/${a.id}`} className="block">
                <h3 className="text-[14px] font-bold text-[#0a0a0a] hover:text-[#15803d] leading-snug mb-1.5">
                  {a.title}
                </h3>
              </Link>
              {a.excerpt && (
                <p className="text-[12px] text-[#71717a] leading-snug line-clamp-2 mb-3">{a.excerpt}</p>
              )}

              <ArticleRowActions
                articleId={a.id}
                slug={a.slug}
                contentGenerated={a.contentGenerated}
                published={a.published}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}
