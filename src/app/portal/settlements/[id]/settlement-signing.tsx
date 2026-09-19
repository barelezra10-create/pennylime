"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptSettlementAgreement } from "@/actions/settlements";
export function SettlementSigning({
  agreement: a,
}: {
  agreement: {
    id: string;
    status: string;
    text: string;
    achText: string;
    total: number;
    schedule: { date: string; amount: number }[];
    expiresAt: string;
    signedName: string | null;
    signedAt: string | null;
    hash: string;
    hasBaseContract?: boolean;
  };
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [ach, setAch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = a.status === "SENT" && new Date(a.expiresAt) > new Date();
  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  async function sign() {
    setBusy(true);
    setError(null);
    try {
      const r = await acceptSettlementAgreement({
        id: a.id,
        signedName: name,
        agreedToAgreement: agreed,
        agreedToAch: ach,
      });
      if (!r.ok) setError(r.error);
      else router.refresh();
    } catch {
      setError(
        "We could not confirm your signature. Refresh to check the agreement before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {money(a.total)} · {a.schedule.length} payments
          </h2>
          <button
            onClick={() => window.print()}
            className="text-xs font-semibold text-green-700 print:hidden"
          >
            Print / save a copy
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Signing deadline: {new Date(a.expiresAt).toLocaleString()}
        </p>
        {a.hasBaseContract && <div className="mt-5 rounded-lg border border-zinc-200 p-4"><p className="text-sm">This settlement uses your original signed advance contract with the payment amendment below. Review both before signing.</p><a href={`/api/settlement-contract/${a.id}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-green-700">Open original advance contract (PDF)</a></div>}
        <div className="mt-6 whitespace-pre-wrap text-sm leading-7">
          {a.text}
        </div>
        <h3 className="mb-3 mt-7 font-semibold">
          Replacement payment schedule
        </h3>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Payment date</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {a.schedule.map((p, i) => (
              <tr key={i} className="border-b border-zinc-100">
                <td className="py-2">{p.date}</td>
                <td className="text-right">{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="py-3">Total</th>
              <th className="text-right">{money(a.total)}</th>
            </tr>
          </tfoot>
        </table>
        <h3 className="mb-2 mt-5 font-semibold">ACH authorization</h3>
        <p className="text-sm leading-6">{a.achText}</p>
        {a.signedAt && (
          <div className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
            Signed by {a.signedName} on {new Date(a.signedAt).toLocaleString()}.{" "}
            {a.status === "ACTIVE"
              ? "Your new schedule is active."
              : "This agreement was replaced by a later signed settlement."}
          </div>
        )}
        <p className="mt-6 break-all text-[10px] text-zinc-400">
          Agreement reference: {a.id}
          <br />
          SHA-256: {a.hash}
        </p>
      </div>
      {available ? (
        <div className="space-y-4 rounded-xl border border-green-200 bg-white p-6 print:hidden">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1"
            />
            {a.hasBaseContract ? "I have read the original advance contract and agree to the settlement amendment and replacement payment schedule above." : "I have read and agree to the settlement agreement and replacement payment schedule above."}
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={ach}
              onChange={(e) => setAch(e.target.checked)}
              className="mt-1"
            />
            I agree to the ACH authorization above for the listed payments.
          </label>
          <label className="block text-sm font-medium">
            Full legal name
            <input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-3"
              maxLength={200}
            />
          </label>
          <p className="text-xs text-zinc-500">
            Typing your name and choosing “Sign settlement agreement” records
            your electronic signature.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={
              busy ||
              !agreed ||
              !ach ||
              name.trim().length < 4 ||
              !/\s/.test(name.trim())
            }
            onClick={sign}
            className="w-full rounded-lg bg-green-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Recording signature…" : "Sign settlement agreement"}
          </button>
        </div>
      ) : (
        !a.signedAt && (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            This agreement is{" "}
            {new Date(a.expiresAt) <= new Date()
              ? "expired"
              : a.status.toLowerCase()}
            . Contact PennyLime for an updated agreement.
          </p>
        )
      )}
    </div>
  );
}
