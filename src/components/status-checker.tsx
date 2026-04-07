"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getApplicationByCode } from "@/actions/applications";
import { Loader2, Search } from "lucide-react";
import { StatusDisplay } from "@/components/status-display";

type ApplicationResult = NonNullable<Awaited<ReturnType<typeof getApplicationByCode>>>;

export function StatusChecker() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApplicationResult | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = code.trim();
    if (trimmed.length !== 8) {
      toast.error("Application code must be 8 characters");
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const app = await getApplicationByCode(trimmed);
      setResult(app ?? null);
      if (!app) {
        toast.error("Application not found");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-6">
      <div className="bg-white rounded-[10px] p-6">
        <h2 className="text-[28px] font-extrabold tracking-[-0.03em] text-[#1a1a1a] mb-6">
          Check Application Status
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="code" className="text-sm font-medium text-[#1a1a1a]">
              Application Code
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))}
              placeholder="e.g. AB12CD34"
              maxLength={8}
              className="font-mono text-lg tracking-widest uppercase bg-white rounded-[10px] border-0 px-4 py-3 text-[#1a1a1a] placeholder:text-[#a1a1aa] outline-none ring-1 ring-[#e4e4e7] focus:ring-2 focus:ring-[#1a1a1a] w-full"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-[#1a1a1a] text-white rounded-[8px] px-6 py-3 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <Search className="size-4" />
                Check Status
              </>
            )}
          </button>
        </form>
      </div>

      {searched && !loading && result && <StatusDisplay application={{
        ...result,
        loanAmount: Number(result.loanAmount),
      }} />}

      {searched && !loading && !result && (
        <div className="bg-white rounded-[10px] p-8 text-center">
          <p className="text-[#a1a1aa]">
            Application not found. Please check your code and try again.
          </p>
        </div>
      )}
    </div>
  );
}
