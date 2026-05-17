import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { regenerateAction } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function platformPostUrl(platform: string, platformPostId: string | null): string | null {
  if (!platformPostId) return null;
  // Build best-effort deep links per platform
  if (platform === "facebook") return `https://facebook.com/${platformPostId}`;
  // IG / TikTok / LinkedIn don't expose easy deep-links from the id alone;
  // user can copy + paste into platform search
  return null;
}

export default async function SocialPostDetail({ params }: PageProps) {
  const { id } = await params;
  const post = await prisma.socialPost.findUnique({
    where: { id },
    include: { account: true },
  });
  if (!post) notFound();

  const platform = post.account.platform;
  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
  const isImage = post.imageUrl?.match(/\.(png|jpg|jpeg)$/i);
  const isVideo = post.imageUrl?.match(/\.(mp4|mov)$/i);
  const deepLink = platformPostUrl(platform, post.platformPostId);

  const statusColor =
    post.status === "published" ? "bg-green-100 text-green-800"
    : post.status === "failed" ? "bg-red-100 text-red-800"
    : post.status === "blocked" ? "bg-gray-200 text-gray-700"
    : post.status === "planned" ? "bg-blue-100 text-blue-800"
    : "bg-amber-100 text-amber-800";

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3 text-sm">
        <Link href={`/admin/social/calendar/${platform}`} className="text-blue-600 hover:underline">
          ← {platformLabel} calendar
        </Link>
        <span className="text-gray-300">·</span>
        <Link href="/admin/social/posts" className="text-blue-600 hover:underline">
          All posts
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{post.topic}</h1>
          <div className="flex items-center gap-3 mt-2 text-sm">
            <span className="text-gray-600">{platformLabel} · {post.account.handle}</span>
            <span className="text-gray-300">·</span>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
              {post.status}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-600">
              Scheduled {post.scheduledFor.toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
              })} at {post.scheduledFor.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })}
            </span>
          </div>
          {post.publishedAt && (
            <div className="text-xs text-gray-500 mt-1">
              Published {post.publishedAt.toLocaleString()}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {post.status !== "published" && (
            <form action={regenerateAction}>
              <input type="hidden" name="postId" value={post.id} />
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
                title="Pick a new topic and regenerate text+image"
              >
                ↻ Regenerate
              </button>
            </form>
          )}
          {deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md text-sm hover:bg-gray-200"
            >
              View on {platformLabel} ↗
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="md:col-span-3">
          <div className="rounded-xl border bg-white p-3 shadow-sm">
            {isImage && post.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={post.imageUrl} alt={post.topic} className="w-full rounded-lg" />
            )}
            {isVideo && post.imageUrl && (
              <video src={post.imageUrl} controls className="w-full rounded-lg">
                Your browser doesn&apos;t support video playback.
              </video>
            )}
            {!post.imageUrl && (
              <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
                no media
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">Caption</h2>
            {post.body ? (
              <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{post.body}</pre>
            ) : (
              <div className="text-gray-400 italic text-sm">empty</div>
            )}
          </div>

          {post.publishError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <h2 className="text-sm font-semibold text-red-800 mb-2">Error</h2>
              <pre className="whitespace-pre-wrap text-xs text-red-700 font-mono">{post.publishError}</pre>
            </div>
          )}

          {post.platformPostId && (
            <div className="rounded-xl border bg-white p-4 text-xs text-gray-500">
              <div className="font-semibold uppercase mb-1">Platform post ID</div>
              <code className="font-mono break-all">{post.platformPostId}</code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
