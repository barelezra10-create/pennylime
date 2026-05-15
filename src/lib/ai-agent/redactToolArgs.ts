const PII_FIELDS_PER_TOOL: Record<string, string[]> = {
  verifyIdentity: ["dob"],
};

export function redactToolArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  const fields = PII_FIELDS_PER_TOOL[toolName];
  if (!fields) return args;
  const out: Record<string, unknown> = { ...args };
  for (const field of fields) {
    if (field in out) out[field] = "[REDACTED]";
  }
  return out;
}
