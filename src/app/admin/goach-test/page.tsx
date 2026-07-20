import { getGoachTestState } from "@/actions/goach-test";
import { GoachTestClient } from "./client";

export const dynamic = "force-dynamic";

export default async function GoachTestPage() {
  const initial = await getGoachTestState();
  return (
    <div className="max-w-3xl mx-auto py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0a0a0a]">GoACH smoke test</h1>
        <p className="mt-1 text-sm text-[#52525b]">
          End-to-end ACH debit + credit using the seeded test application (
          <code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">plaid-smoke-test</code>). The
          test app must be Plaid-linked first (connect a bank via the apply funnel). This path calls the GoACH client directly and does not flip the global{" "}
          <code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">paymentProcessor</code> switch.
        </p>
      </header>
      <GoachTestClient initialState={initial} />
    </div>
  );
}
