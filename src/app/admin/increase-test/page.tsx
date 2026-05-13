import { getIncreaseTestState } from "@/actions/increase-test";
import { IncreaseTestClient } from "./client";

export const dynamic = "force-dynamic";

export default async function IncreaseTestPage() {
  const initial = await getIncreaseTestState();
  return (
    <div className="max-w-3xl mx-auto py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0a0a0a]">Increase smoke test</h1>
        <p className="mt-1 text-sm text-[#52525b]">
          End-to-end ACH credit + debit using the seeded test application
          (<code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">plaid-smoke-test</code>). The
          test app must be Plaid-linked first via{" "}
          <a className="text-[#15803d] hover:underline" href="/admin/plaid-test">
            /admin/plaid-test
          </a>
          .
        </p>
      </header>
      <IncreaseTestClient initialState={initial} />
    </div>
  );
}
