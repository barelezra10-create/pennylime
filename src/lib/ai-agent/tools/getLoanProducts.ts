import type { ToolDefinition } from "../types";

export const getLoanProducts: ToolDefinition = {
  name: "getLoanProducts",
  description: "Public product info: amounts, term, eligibility for PennyLime cash advances.",
  parameters: { type: "object", properties: {} },
  requiredAuth: "anon",
  isWrite: false,
  handler: async () => ({
    status: "ok",
    data: {
      product: "cash advance",
      minAmount: 500,
      maxAmount: 10000,
      termWeeksMin: 1,
      termWeeksMax: 16,
      eligibility: ["Uber", "Lyft", "DoorDash", "Instacart", "Grubhub", "Amazon Flex"],
      repayment: "ACH debit on payday schedule",
    },
  }),
};
