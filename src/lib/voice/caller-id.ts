import { AREA_CODE_STATES } from "./area-code-states";

export type CallerNumber = { number: string; label: string };
export function usAreaCode(phone: string): string | null {
  // Never reinterpret an explicitly international number as a US number.
  const text = phone.trim();
  if (text.startsWith("+") && !text.startsWith("+1")) return null;
  let digits = text.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  const code = digits.slice(0, 3);
  return AREA_CODE_STATES[code] ? code : null;
}

/** Only returns caller IDs present in the live owned-number inventory. */
export function selectCallerId(input: {
  to: string;
  numbers: CallerNumber[];
  defaultNumber: string | null | undefined;
  manualNumber?: string | null;
}) {
  const numbers = [...input.numbers].sort((a, b) => a.number.localeCompare(b.number));
  const area = usAreaCode(input.to);
  const state = area ? AREA_CODE_STATES[area] : null;
  const manual = numbers.find(n => n.number === input.manualNumber);
  if (manual) return { number: manual.number, state, reason: "manual" as const };
  const exact = area && numbers.find(n => usAreaCode(n.number) === area);
  if (exact) return { number: exact.number, state, reason: "area-code" as const };
  const local = state && numbers.find(n => {
    const code = usAreaCode(n.number);
    return code && AREA_CODE_STATES[code] === state;
  });
  if (local) return { number: local.number, state, reason: "state" as const };
  const fallback = numbers.find(n => n.number === input.defaultNumber) ?? numbers[0];
  return { number: fallback?.number ?? null, state, reason: "fallback" as const };
}
