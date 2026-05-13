import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { Platform } from "../types";
import { saveImage } from "../storage";

const ASPECTS: Record<Platform, { width: number; height: number; aspectRatio: string }> = {
  instagram: { width: 1080, height: 1080, aspectRatio: "1:1" },
  facebook: { width: 1200, height: 630, aspectRatio: "16:9" }, // Imagen doesn't support 1.91:1; use 16:9
  linkedin: { width: 1200, height: 627, aspectRatio: "16:9" },
  tiktok: { width: 1080, height: 1920, aspectRatio: "9:16" },
};

// Verified available 2026-05-13 via /v1beta/models endpoint.
// Fallback order if this 404s: imagen-3.0-generate-002 then imagen-3.0-generate-001
const IMAGEN_MODEL = "imagen-4.0-generate-001";

let _client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required");
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

export async function generatePostImage(topic: string, platform: Platform): Promise<string> {
  const client = getClient();
  const aspect = ASPECTS[platform];

  const prompt = `Editorial illustration for a social media post about: "${topic}".
Style: clean, modern, fintech-friendly, gig economy aesthetic. Subtle palette using deep navy, lime green (#7BFF00), white, soft shadows. NO text in image. NO logos. NO faces (avoid likeness issues). Aspect ratio ${aspect.aspectRatio}. ${aspect.width}x${aspect.height}px.`;

  let response;
  try {
    response = await client.models.generateImages({
      model: IMAGEN_MODEL,
      prompt,
      config: { numberOfImages: 1, aspectRatio: aspect.aspectRatio },
    });
  } catch (err) {
    throw new Error(
      `Imagen generation failed [${platform}, "${topic}"]: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const img = response.generatedImages?.[0]?.image?.imageBytes;
  if (!img) throw new Error(`Imagen returned no image [${platform}, "${topic}"]`);

  const buffer = Buffer.from(img, "base64");
  return await saveImage(buffer, "png");
}
