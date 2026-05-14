import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function statusBadgeClass(status: string): string {
  switch (status) {
    case "published":
      return "bg-green-100 text-green-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "blocked":
      return "bg-gray-100 text-gray-600";
    case "failed":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

export default async function SocialPostsPage() {
  const posts = await prisma.socialPost.findMany({
    include: { account: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Post History</h1>
        <p className="mt-1 text-sm text-gray-500">
          100 most recent generated posts across all accounts, newest first.
        </p>
      </div>

      {/* Post list */}
      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
          No posts yet.
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const isProblematic = post.status === "blocked" || post.status === "failed";
            return (
              <div
                key={post.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  isProblematic ? "border-red-200" : "border-gray-200"
                }`}
              >
                {/* Top row: platform/handle + timestamp + status badge */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 capitalize">
                      {post.account.platform}&nbsp;&middot;&nbsp;{post.account.handle}
                    </span>
                    <span className="text-xs text-gray-400">
                      {post.createdAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(
                      post.status
                    )}`}
                  >
                    {post.status}
                  </span>
                </div>

                {/* Topic */}
                <p className="text-sm font-semibold text-gray-800 mb-2">{post.topic}</p>

                {/* Image preview */}
                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt={post.topic}
                    className="mt-2 max-w-xs rounded border border-gray-100"
                  />
                )}

                {/* Body */}
                <pre className="mt-3 whitespace-pre-wrap text-sm text-gray-600 font-sans leading-relaxed">
                  {post.body}
                </pre>

                {/* Error text for failed/blocked */}
                {isProblematic && post.publishError && (
                  <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-600 break-words">
                    {post.publishError}
                  </p>
                )}

                {/* Platform post ID for published */}
                {post.status === "published" && post.platformPostId && (
                  <p className="mt-3 text-xs text-gray-400">
                    Platform post ID:{" "}
                    <span className="font-mono text-gray-600">{post.platformPostId}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
