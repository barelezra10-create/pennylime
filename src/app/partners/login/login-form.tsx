"use client";

import { useActionState } from "react";
import { submitPartnerLogin } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(submitPartnerLogin, { error: null as string | null });

  return (
    <form action={action} className="mt-6 space-y-3">
      <input
        type="password"
        name="password"
        placeholder="Access code"
        autoFocus
        className="w-full rounded-lg border border-[#e4e4e7] bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#15803d]"
      />
      {state.error ? (
        <p className="text-xs text-red-600">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[#15803d] hover:bg-[#166534] text-white text-sm font-semibold py-2.5 transition-colors disabled:opacity-60"
      >
        {pending ? "Checking..." : "Enter"}
      </button>
    </form>
  );
}
