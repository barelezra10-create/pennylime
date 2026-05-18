// Imported by both the Next.js web app and the pennylime-voice Node service,
// so this module must not depend on the `server-only` marker.
import { GoogleGenAI, type FunctionDeclaration } from "@google/genai";

// Keep MODEL and the price constants in cost.ts in sync.
// gemini-2.5-flash-lite is the cheapest current Gemini Flash variant and is
// the only one this Google account's API key can call (2.5-flash 403s,
// 2.0-flash was retired). Override via env if you upgrade the key.
const MODEL = process.env.GEMINI_AGENT_MODEL || "gemini-2.5-flash-lite";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  client = new GoogleGenAI({ apiKey });
  return client;
}

export type GeminiTurn =
  | { role: "user"; parts: Array<{ text?: string; functionResponse?: { name: string; response: Record<string, unknown> } }> }
  | { role: "model"; parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> };

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

  // Use the SDK convenience getters (`res.text`, `res.functionCalls`) so we
  // correctly handle multi-part responses from 2.5 models where the first
  // part may be a `thought` block and the actual text or function call lives
  // at a later index.
  const text = res.text;
  const fc = res.functionCalls?.[0];
  const usage = res.usageMetadata;

  return {
    text: text || undefined,
    functionCall: fc
      ? { name: fc.name ?? "", args: (fc.args ?? {}) as Record<string, unknown> }
      : undefined,
    tokensIn: usage?.promptTokenCount ?? 0,
    tokensOut: usage?.candidatesTokenCount ?? 0,
  };
}
