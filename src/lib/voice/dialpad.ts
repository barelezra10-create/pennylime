// Pure helpers for the manual dial pad. US-only formatting, matching the normalizePhone convention used across the app (+1 prefix).

/** Strip non-digit characters and cap the result at 11 digits. */
export function dialedDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, 11);
}

/** Strip a leading "1" only when the string is exactly 11 digits long, returning the 10-digit local number. */
function stripLeadingOne(digits: string): { ten: string; hasCountryCode: boolean } {
  if (digits.length === 11 && digits[0] === "1") {
    return { ten: digits.slice(1), hasCountryCode: true };
  }
  return { ten: digits, hasCountryCode: false };
}

/** Format a digit string progressively as (XXX) XXX-XXXX, prefixed with +1 when a country code is present. */
export function formatDialed(digits: string): string {
  if (digits === "") return "";
  const { ten, hasCountryCode } = stripLeadingOne(digits);
  const prefix = hasCountryCode ? "+1 " : "";

  if (ten.length <= 3) return `${prefix}(${ten}`;
  if (ten.length <= 6) return `${prefix}(${ten.slice(0, 3)}) ${ten.slice(3)}`;
  return `${prefix}(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6, 10)}`;
}

/** Return the E.164 representation (+1XXXXXXXXXX) for a complete US number, or null if incomplete. */
export function dialedToE164(digits: string): string | null {
  const { ten } = stripLeadingOne(digits);
  return ten.length === 10 ? `+1${ten}` : null;
}
