const SSN_DASHED = /\b\d{3}-\d{2}-\d{4}\b/g;
const SSN_NINE = /\b\d{9}\b/g;
const SSN_LAST4_KEYWORD = /\b(ssn|social)\D{0,12}?\b\d{4}\b/gi;
const DOB_SLASH = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
const DOB_DASH = /\b\d{4}-\d{1,2}-\d{1,2}\b/g;
const DOB_KEYWORD = /\b(dob|born)\D{0,4}?(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/gi;

export function redactPII(input: string): string {
  if (!input) return "";
  return input
    .replace(SSN_DASHED, "[REDACTED]")
    .replace(SSN_NINE, "[REDACTED]")
    .replace(SSN_LAST4_KEYWORD, (m) => m.replace(/\d{4}\b/, "[REDACTED]"))
    .replace(DOB_KEYWORD, (m) => m.replace(/\d.*$/, "[REDACTED]"))
    .replace(DOB_SLASH, "[REDACTED]")
    .replace(DOB_DASH, "[REDACTED]");
}
