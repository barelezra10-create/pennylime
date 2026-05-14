import { getPlaidTestAppState } from "@/actions/plaid-test";
import { PlaidTestClient } from "./client";

export const dynamic = "force-dynamic";

export default async function PlaidTestPage() {
  const initialState = await getPlaidTestAppState();
  const plaidEnv = process.env.PLAID_ENV || "sandbox";
  const products = process.env.PLAID_PRODUCTS || "auth,identity,transactions";
  const isProd = plaidEnv === "production";

  return (
    <div className="max-w-3xl mx-auto py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0a0a0a]">Plaid smoke test</h1>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              isProd ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {plaidEnv}
          </span>
        </div>
        <p className="mt-1 text-sm text-[#52525b]">
          End-to-end test of the Plaid integration on a fixed seeded application
          (<code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">plaid-smoke-test</code>).
          {isProd ? (
            <> Real bank linking — use a real bank login.</>
          ) : (
            <>
              {" "}Uses sandbox credentials{" "}
              <code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">user_good</code> /
              <code className="text-xs bg-[#f4f4f5] px-1 py-0.5 rounded">pass_good</code>.
            </>
          )}
        </p>
        <p className="mt-1 text-[11px] text-[#a1a1aa]">Products: <code className="bg-[#f4f4f5] px-1 py-0.5 rounded">{products}</code></p>
      </header>
      <PlaidTestClient initialState={initialState} />
    </div>
  );
}
