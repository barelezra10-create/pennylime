import type { ToolDefinition } from "../types";

// PennyLime state availability + APR caps. Source-of-truth lives in
// the existing disclosures content; this table mirrors it for the agent.
const STATE_RULES: Record<string, { aprCap: number; minAmount: number; maxAmount: number }> = {
  FL: { aprCap: 36, minAmount: 100, maxAmount: 10000 },
  TX: { aprCap: 36, minAmount: 100, maxAmount: 10000 },
  GA: { aprCap: 36, minAmount: 100, maxAmount: 10000 },
  AZ: { aprCap: 36, minAmount: 100, maxAmount: 10000 },
  NV: { aprCap: 36, minAmount: 100, maxAmount: 10000 },
};

export const getStateRules: ToolDefinition = {
  name: "getStateRules",
  description: "Returns whether PennyLime operates in the given US state and the APR cap that applies.",
  parameters: {
    type: "object",
    properties: { state: { type: "string", description: "Two-letter US state code, e.g. FL" } },
    required: ["state"],
  },
  requiredAuth: "anon",
  isWrite: false,
  handler: async (args) => {
    const state = String(args.state ?? "").toUpperCase().trim();
    const rule = STATE_RULES[state];
    if (!rule) {
      return {
        status: "ok",
        data: { state, supported: false, message: `PennyLime is not currently available in ${state}.` },
        summary: `state ${state}: not supported`,
      };
    }
    return {
      status: "ok",
      data: { state, supported: true, ...rule },
      summary: `state ${state}: APR cap ${rule.aprCap}%`,
    };
  },
};
