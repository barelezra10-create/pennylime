import "server-only";
import { GoogleGenAI, type FunctionDeclaration } from "@google/genai";

const MODEL = "gemini-2.0-flash";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  client = new GoogleGenAI({ apiKey });
  return client;
}

export type GeminiTurn =
  | { role: "user"; parts: Array<{ text: string }> }
  | { role: "model"; parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> }
  | { role: "function"; parts: Array<{ functionResponse: { name: string; response: Record<string, unknown> } }> };

export type GeminiCallResult = {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  tokensIn: number;
  tokensOut: number;
};

export async function callGemini(
  systemInstruction: string,
  history: GeminiTurn[],
  tools: FunctionDeclaration[],
): Promise<GeminiCallResult> {
  const res = await getClient().models.generateContent({
    model: MODEL,
    contents: history,
    config: {
      systemInstruction,
      tools: tools.length ? [{ functionDeclarations: tools }] : undefined,
      temperature: 0.3,
    },
  });

  const part = res.candidates?.[0]?.content?.parts?.[0];
  const fc = part && "functionCall" in part ? part.functionCall : undefined;
  const text = part && "text" in part ? part.text : undefined;
  const usage = res.usageMetadata;

  return {
    text: text ?? undefined,
    functionCall: fc
      ? { name: fc.name ?? "", args: (fc.args ?? {}) as Record<string, unknown> }
      : undefined,
    tokensIn: usage?.promptTokenCount ?? 0,
    tokensOut: usage?.candidatesTokenCount ?? 0,
  };
}
