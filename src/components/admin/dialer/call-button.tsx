"use client";

import { useDialer } from "./dialer-provider";

export function CallButton({
  phone,
  name,
  contactId,
  compact = false,
}: {
  phone: string | null | undefined;
  name: string;
  contactId?: string;
  compact?: boolean;
}) {
  const { state, startCall } = useDialer();
  const busy = state.phase !== "idle" && state.phase !== "wrap-up" && state.phase !== "error";
  const disabled = !phone || busy;

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!phone) return;
    void startCall({ phone, name, contactId });
  };

  if (compact) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        title={!phone ? "No phone number" : busy ? "Call in progress" : `Call ${name}`}
        className="rounded-md p-1 text-[#2563eb] hover:bg-[#eff6ff] disabled:opacity-30 disabled:hover:bg-transparent"
      >
        &#9742;
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={!phone ? "No phone number" : undefined}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
    >
      &#9742; Call
    </button>
  );
}
