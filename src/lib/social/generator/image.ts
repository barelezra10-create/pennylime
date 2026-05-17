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

  const prompt = `Editorial illustration for a PennyLime social media post about: "${topic}".

PENNYLIME BRAND RULES (strict):
- 2-color limit: brand lime green (#15803D primary, #A3E635 vivid highlights, #166534 deep shadow) PLUS one neutral (ink #0A0A0A or cream #FEFCE8). NO other hues.
- Show the artifact, not the person. Render phone screens, app dashboards, bank deposit notifications, ACH receipts, ride-share map UIs, delivery bags, the driver's seat, the seller's packing desk, gas-pump nozzles. Documentary / editorial style.
- NO faces, NO smiling stock-actor people, NO handshakes, NO boardrooms, NO suits, NO generic "team standing in office" tropes.
- NO text, NO numbers visible in the image, NO logos. The post caption carries the message; the image is purely visual.
- Audience: gig-economy workers (Uber/Lyft drivers, DoorDash/Instacart shoppers, Amazon FBA sellers, Fiverr/Upwork freelancers). Render the world they actually work in.
- Mood: confident, plain, modern, warm. NOT "stock fintech violet/blue" and NOT "Wall Street."
- Aspect ratio ${aspect.aspectRatio}, target ${aspect.width}x${aspect.height}px.

If the topic is about taxes, render a tax form + phone showing rideshare app. If about cashflow, render a bank notification on a phone screen on a car dashboard. If about platform-tips, render the platform's app UI (Uber/DoorDash style map, NOT named or branded). If "who we are" intro content, render the lime fruit half-slice illustration on warm paper (cross-section, eight visible segments, juicy pulp).`;

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
