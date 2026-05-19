import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Platform } from "@/lib/social/types";
import { planMonthAction, regeneratePostAction } from "./actions";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS: ReadonlyArray<Platform> = ["instagram", "facebook", "linkedin", "tiktok"];

interface PageProps {
  params: Promise<{ platform: string }>;
  searchParams: Promise<{ y?: string; m?: string }>;
}

export default async function PlatformCalendar({ params, searchParams }: PageProps) {
  const { platform } = await params;
  const sp = await searchParams;
  if (!VALID_PLATFORMS.includes(platform as Platform)) notFound();
  const platformT = platform as Platform;

  const now = new Date();
  const year = sp.y ? Number(sp.y) : now.getUTCFullYear();
  const month = sp.m ? Number(sp.m) : now.getUTCMonth() + 1; // 1-12

  // Compute prev/next month for navigation
  const prevDate = new Date(Date.UTC(year, month - 2, 1));
  const nextDate = new Date(Date.UTC(year, month, 1));
  const prevY = prevDate.getUTCFullYear();
  const prevM = prevDate.getUTCMonth() + 1;
  const nextY = nextDate.getUTCFullYear();
  const nextM = nextDate.getUTCMonth() + 1;

  // Pull all SocialPosts for this account in this month
  const account = await prisma.socialAccount.findUnique({
    where: { platform_handle: { platform: platformT, handle: "@pennylime" } },
  });

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const posts = account
    ? await prisma.socialPost.findMany({
        where: {
          accountId: account.id,
          scheduledFor: { gte: monthStart, lt: monthEnd },
        },
        orderBy: { scheduledFor: "asc" },
      })
    : [];

  // Detect media type by extension on imageUrl (.mp4/.mov = reel)
  const isReel = (p: (typeof posts)[number]): boolean =>
    !!p.imageUrl && /\.(mp4|mov)$/i.test(p.imageUrl);

  // Map day-of-month → { image, reel } posts (last write wins per slot)
  const cellsByDay = new Map<
    number,
    { image: (typeof posts)[number] | null; reel: (typeof posts)[number] | null }
  >();
  for (const p of posts) {
    const d = p.scheduledFor.getUTCDate();
    const slot = cellsByDay.get(d) ?? { image: null, reel: null };
    if (isReel(p)) slot.reel = p;
    else slot.image = p;
    cellsByDay.set(d, slot);
  }

  // Reels only happen on Mon/Wed/Fri (UTC dayOfWeek 1, 3, 5)
  const REEL_DOW = new Set([1, 3, 5]);
  const isReelDay = (year: number, monthIdx: number, day: number): boolean =>
    REEL_DOW.has(new Date(Date.UTC(year, monthIdx, day, 15)).getUTCDay());

  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // Render a 6-week (42-cell) grid starting from the first day of the week
  // containing day 1 of this month. Each cell shows its date number.
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
  const cells: Array<{ day: number | null; inMonth: boolean }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: null, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  while (cells.length % 7 !== 0) cells.push({ day: null, inMonth: false });

  const todayDay =
    now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month
      ? now.getUTCDate()
      : -1;

  const platformLabel = platformT.charAt(0).toUpperCase() + platformT.slice(1);
  const allDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const unplannedImageCount = allDays.filter((d) => !cellsByDay.get(d)?.image).length;
  // Reels only count missing on Mon/Wed/Fri days
  const reelDays = allDays.filter((d) => isReelDay(year, month - 1, d));
  const unplannedReelCount = reelDays.filter((d) => !cellsByDay.get(d)?.reel).length;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{platformLabel} calendar</h1>
          <p className="text-sm text-gray-600 mt-1">
            Pre-plan, preview, and regenerate posts for @pennylime on {platformLabel}.
            Posts fire daily at 15:00 UTC.
          </p>
        </div>
        <div className="flex gap-2">
          {(["instagram", "facebook", "linkedin", "tiktok"] as Platform[]).map((p) => (
            <Link
              key={p}
              href={`/admin/social/calendar/${p}`}
              className={`px-3 py-1.5 rounded-md text-sm ${p === platformT ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {p}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between bg-white rounded-xl border p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/social/calendar/${platformT}?y=${prevY}&m=${prevM}`}
            className="px-3 py-1.5 rounded-md text-sm bg-gray-100 hover:bg-gray-200"
          >
            ← {new Date(Date.UTC(prevY, prevM - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric" })}
          </Link>
          <h2 className="text-xl font-semibold px-2">{monthName}</h2>
          <Link
            href={`/admin/social/calendar/${platformT}?y=${nextY}&m=${nextM}`}
            className="px-3 py-1.5 rounded-md text-sm bg-gray-100 hover:bg-gray-200"
          >
            {new Date(Date.UTC(nextY, nextM - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric" })} →
          </Link>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600">
            {posts.length} posts · {unplannedImageCount} image slots empty
            {platformT === "instagram" && ` · ${unplannedReelCount} reel slots empty`}
          </span>
          {unplannedImageCount > 0 && (
            <form action={planMonthAction}>
              <input type="hidden" name="platform" value={platformT} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <input type="hidden" name="mediaType" value="image" />
              <button
                type="submit"
                className="bg-green-600 text-white px-4 py-2 rounded-md text-sm hover:bg-green-700 disabled:opacity-60"
                title={`Plans up to 3 image days per click. Click ${Math.ceil(unplannedImageCount / 3)}x to fill all ${unplannedImageCount} empty image days.`}
              >
                Plan next {Math.min(3, unplannedImageCount)} image of {unplannedImageCount}
              </button>
            </form>
          )}
          {platformT === "instagram" && unplannedReelCount > 0 && (
            <form action={planMonthAction}>
              <input type="hidden" name="platform" value={platformT} />
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <input type="hidden" name="mediaType" value="reel" />
              <button
                type="submit"
                className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm hover:bg-purple-700 disabled:opacity-60"
                title={`Reels schedule on Mon/Wed/Fri only. Plans up to 2 reels per click (~60-120s each via Veo).`}
              >
                Plan next 2 reel of {unplannedReelCount}
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 text-xs uppercase text-gray-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-3 py-2 border-b">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const slot = cell.day ? cellsByDay.get(cell.day) : null;
            const image = slot?.image;
            const reel = slot?.reel;
            const isToday = cell.day === todayDay;
            const cellIsReelDay =
              cell.day && cell.inMonth && isReelDay(year, month - 1, cell.day);
            return (
              <div
                key={i}
                className={`min-h-[180px] border-r border-b p-2 ${!cell.inMonth ? "bg-gray-50" : ""} ${isToday ? "ring-2 ring-green-500 ring-inset" : ""}`}
              >
                {cell.day && (
                  <>
                    <div className="text-xs text-gray-500 mb-1 flex items-center justify-between">
                      <span>{cell.day}</span>
                      {cellIsReelDay && platformT === "instagram" && (
                        <span className="text-[8px] uppercase text-purple-600 font-semibold">reel day</span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {[
                        { post: image, type: "image" as const },
                        { post: reel, type: "reel" as const, slotExpected: cellIsReelDay && platformT === "instagram" },
                      ].map(({ post, type, slotExpected }) => {
                        if (!post) {
                          if (type === "reel" && !slotExpected) return null;
                          return (
                            <div key={type} className="text-[10px] text-gray-400 italic">
                              {type === "reel" ? "no reel" : "empty"}
                            </div>
                          );
                        }
                        const isVid = !!post.imageUrl && /\.(mp4|mov)$/i.test(post.imageUrl);
                        return (
                          <div key={post.id} className={type === "reel" ? "border-l-2 border-purple-300 pl-1" : ""}>
                            <Link href={`/admin/social/posts/${post.id}`} className="block group">
                              {post.imageUrl && (isVid ? (
                                <video
                                  src={post.imageUrl}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="w-full h-16 object-cover rounded group-hover:opacity-80 transition"
                                />
                              ) : (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  src={post.imageUrl}
                                  alt=""
                                  className="w-full h-16 object-cover rounded group-hover:opacity-80 transition"
                                />
                              ))}
                              <div className="text-[10px] line-clamp-2 font-medium mt-1 group-hover:text-blue-700">{post.topic}</div>
                            </Link>
                            <div className="flex items-center justify-between mt-0.5 gap-1">
                              <span
                                className={`text-[8px] uppercase font-semibold px-1 py-0.5 rounded ${
                                  post.status === "published" ? "bg-green-100 text-green-800"
                                  : post.status === "failed" ? "bg-red-100 text-red-800"
                                  : post.status === "blocked" ? "bg-gray-200 text-gray-700"
                                  : post.status === "planned" ? "bg-blue-100 text-blue-800"
                                  : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {type === "reel" ? "REEL " : ""}{post.status}
                              </span>
                              {post.status !== "published" && (
                                <form action={regeneratePostAction}>
                                  <input type="hidden" name="postId" value={post.id} />
                                  <input type="hidden" name="platform" value={platformT} />
                                  <button
                                    type="submit"
                                    className="text-[9px] text-blue-600 hover:underline"
                                  >
                                    ↻ regen
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Click <b>Plan empty days</b> to pre-generate text + image for every blank day of this month
        (~$0.04/post on Imagen). Click <b>↻ regen</b> on any planned post to pick a fresh topic and
        regenerate. Posts auto-publish at 15:00 UTC on their scheduled day.
      </p>
    </div>
  );
}
