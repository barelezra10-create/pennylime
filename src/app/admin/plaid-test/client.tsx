"use client";

import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import {
  getPlaidTestAppState,
  persistPlaidLinkToTestApp,
  resetTestApp,
  getPlaidDebugDump,
  type PlaidTestAppState,
  type PlaidDebugDump,
} from "@/actions/plaid-test";
import { fetchAndStoreIncome, ensureIncreaseExternalAccount } from "@/actions/plaid";

const TEST_APP_ID = "plaid-smoke-test";

type StepStatus = "pending" | "running" | "success" | "error";
type PipelineSteps = {
  link: StepStatus;
  persist: StepStatus;
  income: StepStatus;
  externalAccount: StepStatus;
};

const initialSteps: PipelineSteps = {
  link: "pending",
  persist: "pending",
  income: "pending",
  externalAccount: "pending",
};

export function PlaidTestClient({ initialState }: { initialState: PlaidTestAppState }) {
  const [state, setState] = useState<PlaidTestAppState>(initialState);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [steps, setSteps] = useState<PipelineSteps>(initialSteps);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [lastExternalAccountId, setLastExternalAccountId] = useState<string | null>(null);
  const [debugDump, setDebugDump] = useState<PlaidDebugDump | null>(null);

  // Fetch a link token whenever we're not currently linked
  useEffect(() => {
    if (state.plaidAccessTokenStored) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plaid/create-link-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: TEST_APP_ID }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setLinkToken(data.linkToken);
      } catch (err) {
        toast.error("Failed to create Plaid link token");
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.plaidAccessTokenStored]);

  const refreshState = async () => {
    const next = await getPlaidTestAppState();
    setState(next);
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      // Step 1 (link) succeeded
      setSteps((s) => ({ ...s, link: "success", persist: "running" }));
      setLastResult({ phase: "plaidLinkSuccess", metadata });

      try {
        // Exchange public token
        const exchangeRes = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            accountId: metadata.accounts[0]?.id,
          }),
        });
        if (!exchangeRes.ok) throw new Error(`exchange-token status ${exchangeRes.status}`);
        const exchanged = await exchangeRes.json();
        setLastResult({ phase: "exchange", exchanged });

        // Persist to test app
        const persistResult = await persistPlaidLinkToTestApp({
          accessToken: exchanged.accessToken,
          itemId: exchanged.itemId,
          accountId: exchanged.accountId,
        });
        if (!persistResult.ok) throw new Error("persist failed");
        setSteps((s) => ({ ...s, persist: "success", income: "running" }));
        await refreshState();

        // Fetch income & balance
        const incomeResult = await fetchAndStoreIncome(TEST_APP_ID);
        setLastResult({ phase: "income", incomeResult });
        if (!incomeResult.success) {
          setSteps((s) => ({ ...s, income: "error" }));
          toast.error(incomeResult.error || "Income fetch failed");
          await refreshState();
          return;
        }
        setSteps((s) => ({ ...s, income: "success", externalAccount: "running" }));
        await refreshState();

        // Create Increase external account
        const extResult = await ensureIncreaseExternalAccount(TEST_APP_ID);
        setLastResult({ phase: "externalAccount", extResult });
        if (!extResult.ok) {
          setSteps((s) => ({ ...s, externalAccount: "error" }));
          toast.error(extResult.error || "External account creation failed");
          return;
        }
        setLastExternalAccountId(extResult.externalAccountId);
        setSteps((s) => ({ ...s, externalAccount: "success" }));
        toast.success("Pipeline complete");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Pipeline failed: ${msg}`);
        setLastResult({ phase: "error", message: msg });
        setSteps((s) => {
          // Mark first non-success step as error
          if (s.persist === "running") return { ...s, persist: "error" };
          if (s.income === "running") return { ...s, income: "error" };
          if (s.externalAccount === "running") return { ...s, externalAccount: "error" };
          return s;
        });
      } finally {
        setRunning(false);
      }
    },
    onExit: (err) => {
      setRunning(false);
      if (err) {
        toast.error(`Plaid Link exited: ${err.error_code} ${err.error_message}`);
        setLastResult({ phase: "linkExit", error: err });
        setSteps((s) => ({ ...s, link: "error" }));
      }
    },
  });

  const onRunPipeline = () => {
    if (!ready || !linkToken) {
      toast.error("Plaid Link not ready yet");
      return;
    }
    setSteps({ ...initialSteps, link: "running" });
    setRunning(true);
    setLastResult(null);
    setLastExternalAccountId(null);
    open();
  };

  const onReset = async () => {
    setRunning(true);
    try {
      await resetTestApp();
      await refreshState();
      setSteps(initialSteps);
      setLastResult(null);
      setLastExternalAccountId(null);
      setDebugDump(null);
      // Refresh link token since we just cleared the connection
      setLinkToken(null);
      toast.success("Test app reset");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Reset failed: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  const onLoadDebugDump = async () => {
    try {
      const dump = await getPlaidDebugDump();
      setDebugDump(dump);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Debug dump failed: ${msg}`);
    }
  };

  const fmtMoney = (n: number | null) =>
    n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Status panel */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Test app state</h2>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
          <Field label="plaidItemId" value={state.plaidItemId} />
          <Field label="plaidAccountId" value={state.plaidAccountId} />
          <Field
            label="plaidAccessToken"
            value={state.plaidAccessTokenStored ? "stored (encrypted)" : "—"}
          />
          <Field
            label="plaidLinkStale"
            value={state.plaidLinkStale ? "true" : "false"}
            warn={state.plaidLinkStale}
          />
          <Field label="monthlyIncome" value={fmtMoney(state.monthlyIncome)} />
          <Field label="bankBalance" value={fmtMoney(state.bankBalance)} />
          <Field label="lastExternalAccountId (client)" value={lastExternalAccountId} />
        </dl>
      </section>

      {/* Pipeline progress */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Pipeline</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <PipelineRow label="1. Plaid Link (sandbox)" status={steps.link} />
          <PipelineRow label="2. Persist tokens to test app" status={steps.persist} />
          <PipelineRow label="3. Fetch income + bank balance" status={steps.income} />
          <PipelineRow label="4. Create Increase external account" status={steps.externalAccount} />
        </ul>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={running || !ready || !linkToken}
            onClick={onRunPipeline}
            className="rounded-lg bg-[#15803d] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-[#166534]"
          >
            Run Plaid pipeline
          </button>
          <button
            type="button"
            disabled={running}
            onClick={onReset}
            className="rounded-lg bg-[#f4f4f5] text-[#0a0a0a] px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-[#e4e4e7]"
          >
            Reset test app
          </button>
          <button
            type="button"
            disabled={running || !state.plaidAccessTokenStored}
            onClick={onLoadDebugDump}
            className="rounded-lg bg-[#f4f4f5] text-[#0a0a0a] px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-[#e4e4e7]"
          >
            Load Plaid debug dump
          </button>
        </div>
      </section>

      {/* Last action result */}
      <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">Last action result</h2>
        <pre className="text-xs bg-[#fafafa] border border-[#e4e4e7] rounded-lg p-3 overflow-auto max-h-80">
          {lastResult ? JSON.stringify(lastResult, null, 2) : "(none yet)"}
        </pre>
      </section>

      {/* Debug dump */}
      {debugDump && (
        <section className="rounded-xl border border-[#e4e4e7] bg-white p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#52525b] mb-3">
            Plaid debug dump (auth + identity + transactions)
          </h2>
          <pre className="text-xs bg-[#fafafa] border border-[#e4e4e7] rounded-lg p-3 overflow-auto max-h-96">
            {JSON.stringify(debugDump, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}

function Field({ label, value, warn }: { label: string; value: string | null; warn?: boolean }) {
  return (
    <>
      <dt className="text-[#71717a] truncate">{label}</dt>
      <dd className={`font-mono text-xs ${warn ? "text-[#b91c1c]" : "text-[#0a0a0a]"}`}>
        {value ?? "—"}
      </dd>
    </>
  );
}

function PipelineRow({ label, status }: { label: string; status: StepStatus }) {
  const icon = status === "success" ? "✓" : status === "error" ? "✗" : status === "running" ? "⏳" : "○";
  const color =
    status === "success"
      ? "text-[#15803d]"
      : status === "error"
      ? "text-[#b91c1c]"
      : status === "running"
      ? "text-[#0a0a0a]"
      : "text-[#a1a1aa]";
  return (
    <li className={`flex items-center gap-2 ${color}`}>
      <span className="font-mono w-4 text-center">{icon}</span>
      <span>{label}</span>
    </li>
  );
}
