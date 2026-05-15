export type AgentChannel = "chat" | "sms" | "voice";
export type AuthLevel = "anon" | "phone-matched" | "verified";

export type AgentCtx = {
  channel: AgentChannel;
  contactId?: string;
  sessionId: string;
  authLevel: AuthLevel;
  metadata: {
    callSid?: string;
    from?: string;
    userAgent?: string;
    ip?: string;
  };
};

export type ToolResult =
  | { status: "ok"; data: unknown; summary?: string }
  | { status: "denied_auth"; required: AuthLevel }
  | { status: "denied_confirm"; needsConfirmation: true; summary: string; token: string }
  | { status: "error"; message: string }
  | { status: "rate_limited" };

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiredAuth: AuthLevel;
  isWrite: boolean;
  handler: (args: Record<string, unknown>, ctx: AgentCtx) => Promise<ToolResult>;
};
