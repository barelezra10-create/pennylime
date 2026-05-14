import { prisma } from "@/lib/db";
import { addTopic, toggleTopic } from "./actions";

export const dynamic = "force-dynamic";

export default async function SocialTopicsPage() {
  const topics = await prisma.topicPool.findMany({
    orderBy: [{ active: "desc" }, { useCount: "asc" }],
  });

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Topic Pool</h1>
        <p className="text-sm text-gray-600 mt-1">
          Topics fed to the post generator. Inactive topics are skipped.
        </p>
      </div>

      <form action={addTopic} className="flex gap-2">
        <input
          name="topic"
          placeholder="New topic..."
          required
          className="flex-1 border rounded-md px-3 py-2 text-sm"
        />
        <select
          name="category"
          defaultValue="cashflow"
          className="border rounded-md px-3 py-2 text-sm"
        >
          <option>tax</option>
          <option>cashflow</option>
          <option>platform-tips</option>
          <option>earnings</option>
          <option>savings</option>
          <option>news</option>
        </select>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm">
          Add
        </button>
      </form>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Topic</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Used</th>
              <th className="px-4 py-2">Last</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.id} className={`border-t ${t.active ? "" : "text-gray-400"}`}>
                <td className="px-4 py-2">{t.topic}</td>
                <td className="px-4 py-2">{t.category}</td>
                <td className="px-4 py-2">{t.useCount}</td>
                <td className="px-4 py-2">{t.lastUsedAt?.toLocaleDateString() ?? "-"}</td>
                <td className="px-4 py-2">{t.active ? "✓" : "✗"}</td>
                <td className="px-4 py-2">
                  <form action={toggleTopic.bind(null, t.id)}>
                    <button type="submit" className="text-blue-600 hover:underline">
                      toggle
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
