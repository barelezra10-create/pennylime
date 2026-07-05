import type { ToolDefinition } from "../types";

export const askOwner: ToolDefinition = {
  name: "askOwner",
  description:
    "File a question you cannot answer to the PennyLime team. Use when the user's question is not covered by your tools or the known answers. The team's reply will appear in this chat later.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The exact question the user asked that you cannot answer.",
      },
    },
    required: ["question"],
  },
  requiredAuth: "anon",
  isWrite: false,
  handler: async (args, ctx) => {
    const question = String(args.question ?? "").trim();
    try {
      const { recordOwnerQuestion } = await import("@/lib/knowledge");
      await recordOwnerQuestion(ctx.sessionId, question);
      return {
        status: "ok",
        data: {
          message:
            "Question filed with the team. Tell the user: great question, I have asked the PennyLime team and their answer will appear right here in this chat. Do not invent an answer.",
        },
        summary: "question filed with owner",
      };
    } catch {
      return {
        status: "ok",
        data: {
          message:
            "Could not reach the team queue. Apologize and suggest emailing support.",
        },
        summary: "owner queue unavailable",
      };
    }
  },
};
