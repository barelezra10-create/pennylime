/** Variants of a caller's number to match against Contact.phone, which is stored unnormalized. */
export function phoneCandidates(from: string | null | undefined): string[] {
  if (!from) return [];
  const digits = from.replace(/\D/g, "");
  if (!digits) return [];
  const ten = digits.startsWith("1") ? digits.slice(1) : digits;
  return [...new Set([from, digits, ten, `+${digits}`, `+1${ten}`, `1${ten}`])];
}
