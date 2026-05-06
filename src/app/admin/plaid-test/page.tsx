import { getPlaidTestAppState, PLAID_TEST_APP_ID } from "@/actions/plaid-test";
import { PlaidTestClient } from "./client";

export const dynamic = "force-dynamic";

export default async function PlaidTestPage() {
  const initialState = await getPlaidTestAppState();

  return (
    <div className="max-w-3xl mx-auto py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0a0a0a]">Plaid smoke test</h1>
        <p className="mt-1 text-sm text-[#52525b]">
          Sandbox-only end-to-end test of the Plaid integration on a fixed seeded application
          (<code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">{PLAID_TEST_APP_ID}</code>).
          Uses sandbox credentials <code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">user_good</code> /
          <code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">pass_good</code>.
        </p>
      </header>
      <PlaidTestClient initialState={initialState} />
    </div>
  );
}
