/** Send one phone-menu key only while the SDK call is connected. */
export function sendCallDigit(
  call: { status: () => string; sendDigits: (digits: string) => void } | null,
  digit: string,
): boolean {
  if (!call || call.status() !== "open" || !/^[0-9*#]$/.test(digit)) return false;
  call.sendDigits(digit);
  return true;
}
