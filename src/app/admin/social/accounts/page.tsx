import { prisma } from "@/lib/db";
import { saveCredentials, saveBotCookies } from "./actions";

export const dynamic = "force-dynamic";

export default async function SocialAccountsPage() {
  const accounts = await prisma.socialAccount.findMany({ orderBy: { platform: "asc" } });

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Social Accounts</h1>
        <p className="text-sm text-gray-600 mt-1">
          Paste OAuth tokens (Meta long-lived page token, LinkedIn Marketing token, TikTok access token) and per-account bot cookies. Tokens are encrypted at rest.
        </p>
      </div>

      {accounts.map((a) => (
        <section key={a.id} className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold">
              {a.platform} · {a.handle}
            </h2>
            <div className="text-xs text-gray-500 mt-1">
              Token: {a.accessToken
                ? `set (expires ${a.tokenExpiresAt?.toLocaleDateString() ?? "?"})`
                : "✗ missing"}
              {" · "}
              Bot: {a.botStatus}
              {a.botCookies && " · cookies set"}
              {a.platformAccountId && ` · accountId: ${a.platformAccountId}`}
            </div>
          </div>

          <form action={saveCredentials} className="space-y-2">
            <input type="hidden" name="id" value={a.id} />
            <textarea
              name="accessToken"
              placeholder="paste access token (will be encrypted)"
              className="w-full border rounded-md p-2 font-mono text-xs"
              rows={2}
            />
            <input
              name="platformAccountId"
              placeholder={
                a.platform === "instagram" ? "IG business user id"
                : a.platform === "facebook" ? "FB page id"
                : a.platform === "linkedin" ? "LI organization id (numeric, no urn:)"
                : "(not used for tiktok)"
              }
              className="w-full border rounded-md p-2 text-sm"
              defaultValue={a.platformAccountId ?? ""}
            />
            <div className="flex items-center gap-2 text-sm">
              <label>Token expires in days:</label>
              <input
                name="tokenExpiresInDays"
                type="number"
                defaultValue={a.platform === "tiktok" ? 1 : 60}
                className="border rounded-md px-2 py-1 w-24"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm"
            >
              Save credentials
            </button>
          </form>

          {(a.platform === "instagram" || a.platform === "facebook" || a.platform === "tiktok") && (
            <form action={saveBotCookies} className="space-y-2 border-t pt-4">
              <input type="hidden" name="id" value={a.id} />
              <label className="text-sm font-medium block">
                Bot session cookies (for engagement bot)
              </label>
              <textarea
                name="cookies"
                placeholder="paste cookies blob from instagrapi/etc (will be encrypted)"
                className="w-full border rounded-md p-2 font-mono text-xs"
                rows={3}
              />
              <button
                type="submit"
                className="bg-gray-700 text-white px-4 py-2 rounded-md text-sm"
              >
                Save bot cookies
              </button>
            </form>
          )}
        </section>
      ))}
    </div>
  );
}
