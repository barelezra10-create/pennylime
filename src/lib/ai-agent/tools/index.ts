import type { AuthLevel, ToolDefinition } from "../types";
import { meetsAuth } from "../authGate";
import { getLoanProducts } from "./getLoanProducts";
import { getStateRules } from "./getStateRules";
import { verifyIdentity } from "./verifyIdentity";
import { sendMagicLink } from "./sendMagicLink";
import { escalateToTicket } from "./escalateToTicket";
import { getApplicationStatus } from "./getApplicationStatus";
import { getLoanSummary } from "./getLoanSummary";
import { getPaymentHistory } from "./getPaymentHistory";
import { schedulePayment } from "./schedulePayment";
import { changeDueDate } from "./changeDueDate";

const ALL_TOOLS: ToolDefinition[] = [
  getLoanProducts,
  getStateRules,
  verifyIdentity,
  sendMagicLink,
  escalateToTicket,
  getApplicationStatus,
  getLoanSummary,
  getPaymentHistory,
  schedulePayment,
  changeDueDate,
];

export function listToolsForAuth(authLevel: AuthLevel): ToolDefinition[] {
  return ALL_TOOLS.filter((t) => meetsAuth(authLevel, t.requiredAuth));
}

export function getTool(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}

export function toolToGeminiDecl(t: ToolDefinition) {
  return { name: t.name, description: t.description, parameters: t.parameters };
}
