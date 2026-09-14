"use client";

import { useDialer } from "./dialer-provider";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

export function InCallKeypad() {
  const { sendDigit } = useDialer();
  return (
    <div
      role="group"
      aria-label="In-call keypad"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || !KEYS.includes(event.key)) return;
        event.preventDefault();
        if (!event.repeat) sendDigit(event.key);
      }}
      className="mt-3 rounded-lg focus-visible:outline-2 focus-visible:outline-[#15803d]"
    >
      <p className="mb-2 text-[12px] text-[#71717a]">Press a key for phone menus or extensions.</p>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-label={`Send ${key}`}
            onClick={() => sendDigit(key)}
            className="rounded-lg border border-[#e4e4e7] py-2 text-[16px] font-medium hover:bg-[#f0fdf4] active:bg-[#dcfce7] focus-visible:outline-2 focus-visible:outline-[#15803d]"
          >{key}</button>
        ))}
      </div>
    </div>
  );
}
