import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { Platform } from "../types";
import { withRetry } from "./retry";

const GEMINI_MODEL = "gemini-2.5-flash";

let _client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required");
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

const PLATFORM_BRIEFS: Record<Platform, string> = {
  instagram: `Instagram caption. Punchy hook in line 1, 3-5 short paragraphs, 4-6 relevant hashtags at end. 800 chars max. Speak to gig workers (Uber/DoorDash/Lyft) directly. Conversational, not corporate.`,
  facebook: `Facebook post. Hook in first sentence, 2-3 paragraphs, no hashtags. 1200 chars max. Focus on practical takeaway. Audience: US gig workers reading on their phone between rides.`,
  linkedin: `LinkedIn post. Professional but human tone. 3-4 paragraphs. Frame PennyLime as a fintech serving the gig economy, mission-driven angle. Position the topic as evidence of why financial tools for variable-income workers matter. 1500 chars max. End with a thought-provoking question.`,
  tiktok: `TikTok caption (image post, square format). Hook in 1 line, 2-3 short bullet-style insights, 4-6 hashtags. 300 chars max. Energetic gig-worker creator voice.`,
};

const SYSTEM_PROMPT = `You write social media content for PennyLime, a cash advance product for gig-economy workers (Uber, Lyft, DoorDash, Instacart, Grubhub, Amazon Flex). Audience = US gig workers managing variable income.

STRICT RULES:
- Never use these words: guaranteed, instant approval, no credit check, no fees, "approved in seconds", "everyone qualifies"
- Never make APR claims or promise specific dollar amounts in the headline
- Never use em dashes (—) or long dashes, use commas, periods, or parentheses instead
- Speak TO the gig worker, not ABOUT them
- Lead with practical value, mention PennyLime only if it fits naturally (max 1 mention)
- No emojis except 1 in the hook line if it fits the platform`;

export async function generatePostText(topic: string, platform: Platform): Promise<string> {
  const client = getClient();
  const prompt = `${SYSTEM_PROMPT}

PLATFORM BRIEF: ${PLATFORM_BRIEFS[platform]}

TOPIC: ${topic}

Write the post now. Output ONLY the post body, no preamble, no quotes around it.`;

  let text: string | undefined;
  try {
    const response = await withRetry(
      () => client.models.generateContent({ model: GEMINI_MODEL, contents: prompt }),
      { label: `gemini-text [${platform}]` },
    );
    text = response.text;
  } catch (err) {
    throw new Error(`Gemini text generation failed [${platform}, "${topic}"]: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!text) throw new Error(`Gemini returned empty text [${platform}, "${topic}"]`);

  let clean = text.trim();
  // strip markdown code fences (gemini occasionally wraps despite "no preamble" instruction)
  clean = clean.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
  // strip ALL surrounding quote characters (handles ""double"" wrapping too)
  clean = clean.replace(/^["']+|["']+$/g, "").trim();
  // safety net: per project content rules, NEVER allow em-dashes through
  clean = clean.replaceAll("—", ",").replaceAll("–", "-");
  return clean;
}
