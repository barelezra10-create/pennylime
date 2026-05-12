import { GoogleGenAI } from "@google/genai";

type Platform = "instagram" | "facebook" | "linkedin" | "tiktok";

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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required");

  const client = new GoogleGenAI({ apiKey });
  const prompt = `${SYSTEM_PROMPT}

PLATFORM BRIEF: ${PLATFORM_BRIEFS[platform]}

TOPIC: ${topic}

Write the post now. Output ONLY the post body, no preamble, no quotes around it.`;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const text = response.text;
  if (!text) throw new Error("Gemini returned empty text");
  // strip surrounding quotes if model added them
  return text.replace(/^["']|["']$/g, "").trim();
}
