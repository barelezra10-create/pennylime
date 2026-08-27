"use client";

import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { completeBankUpdate } from "@/actions/bank-update";

type Status = "idle" | "saving" | "done" | "error";

export function BankUpdateClient({
  token,
  applicationId,
  firstName,
}: {
  token: string;
  applicationId: string;
  firstName: string;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  // OAuth-bank return: restore the link token saved before the handoff.
  const isOAuthReturn =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("oauth_state_id");
  const oauthReceivedRedirectUri =
    typeof window !== "undefined" && isOAuthReturn ? window.location.href : undefined;

  useEffect(() => {
    if (isOAuthReturn) {
      const saved = window.sessionStorage.getItem("pennylime_bankupdate_link_token");
      if (saved) {
        setLinkToken(saved);
        setInitializing(false);
        return;
      }
    }
    (async () => {
      try {
        setInitializing(true);
        const res = await fetch("/api/plaid/create-link-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId }),
        });
        if (!res.ok) throw new Error("init failed");
        const data = await res.json();
        setLinkToken(data.linkToken);
        try {
          window.sessionStorage.setItem("pennylime_bankupdate_link_token", data.linkToken);
        } catch {}
      } catch {
        setError("Could not start the bank connection. Please refresh and try again.");
      } finally {
        setInitializing(false);
      }
    })();
  }, [applicationId, isOAuthReturn]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: oauthReceivedRedirectUri,
    onSuccess: async (publicToken, metadata) => {
      try {
        setStatus("saving");
        setError(null);
        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken, accountId: metadata.accounts[0]?.id }),
        });
        if (!res.ok) throw new Error("exchange failed");
        const data = await res.json();
        const result = await completeBankUpdate({
          token,
          encryptedAccessToken: data.accessToken,
          itemId: data.itemId ?? null,
          accountId: data.accountId ?? null,
        });
        if (!result.ok) {
          setError(result.error);
          setStatus("error");
          return;
        }
        try {
          window.sessionStorage.removeItem("pennylime_bankupdate_link_token");
        } catch {}
        setStatus("done");
      } catch {
        setError("Something went wrong saving your new bank. Please try again.");
        setStatus("error");
      }
    },
  });

  if (status === "done") {
    return (
      <div className="bg-white rounded-2xl border border-[#e4e4e7] p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#f0fdf4] flex items-center justify-center text-[#15803d] text-[24px]">
          ✓
        </div>
        <h1 className="text-[18px] font-bold text-black mb-2">Bank account updated</h1>
        <p className="text-[14px] text-[#71717a]">
          Your new bank account is now connected. Future payments on your PennyLime advance will come from this account. You can close this page.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4e7] p-8">
      <h1 className="text-[18px] font-bold text-black mb-1">Update your bank account</h1>
      <p className="text-[14px] text-[#71717a] mb-6">
        Hi {firstName}, connect the bank account you want us to use for your PennyLime advance payments. Your login is handled securely by Plaid, we never see your bank password.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-[#fef2f2] border border-[#fecaca] px-3 py-2 text-[13px] text-[#b91c1c]">
          {error}
        </div>
      )}

      <button
        onClick={() => open()}
        disabled={!ready || initializing || status === "saving"}
        className="w-full rounded-xl bg-[#15803d] text-white text-[15px] font-semibold py-3 hover:bg-[#166534] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === "saving"
          ? "Saving…"
          : initializing || !ready
            ? "Loading…"
            : "Connect your bank"}
      </button>

      <p className="mt-4 text-[12px] text-[#a1a1aa] text-center">
        Secured by Plaid · Bank-level encryption
      </p>
    </div>
  );
}
