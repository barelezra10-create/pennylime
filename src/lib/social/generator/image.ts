import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { Platform } from "../types";
import { saveImage } from "../storage";
import { withRetry } from "./retry";

const ASPECTS: Record<Platform, { width: number; height: number; aspectRatio: string }> = {
  instagram: { width: 1080, height: 1080, aspectRatio: "1:1" },
  facebook: { width: 1200, height: 630, aspectRatio: "16:9" }, // Imagen doesn't support 1.91:1; use 16:9
  linkedin: { width: 1200, height: 627, aspectRatio: "16:9" },
  tiktok: { width: 1080, height: 1920, aspectRatio: "9:16" },
};

// Using FAST variant: separate quota bucket from imagen-4.0-generate-001
// (which we kept exhausting during bulk planner runs). Roughly half the
// cost too. Quality bracket is basically equivalent for editorial use.
const IMAGEN_MODEL = "imagen-4.0-fast-generate-001";
const SCENE_MODEL = "gemini-2.5-flash";

let _client: GoogleGenAI | undefined;
function getClient(): GoogleGenAI {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY required");
  _client = new GoogleGenAI({ apiKey });
  return _client;
}

// Step 1: translate the topic into a *wordless visual scene* via Gemini.
// We don't pass the topic verbatim to Imagen because Imagen will render the
// words. Instead we ask Gemini to describe one concrete object/setting that
// represents the topic visually (no people, no signage, no captions).
async function describeScene(client: GoogleGenAI, topic: string): Promise<string> {
  const prompt = `Given this content topic for a gig-economy finance brand:

"${topic}"

Describe ONE concrete visual scene that represents this topic. Constraints:
- 1-2 sentences, ~25 words
- Specific physical objects only (phone showing app UI, car dashboard, gas pump nozzle, paper receipt, delivery bag on doorstep, packing tape on cardboard box, etc.)
- NO people, NO faces, NO signs with readable words, NO logos, NO numbers
- US setting only — no foreign-language signage, no non-Latin scripts (no Arabic, no Cyrillic, no Chinese/Japanese/Korean characters in the scene)
- Concrete time-of-day + lighting cue (e.g. "early morning sunlight through windshield", "neon glow from phone in dark cab", "kitchen-table light on tax forms")

Output ONLY the scene description. No preamble. No quotes.`;

  const res = await withRetry(
    () => client.models.generateContent({ model: SCENE_MODEL, contents: prompt }),
    { label: "scene-describer" },
  );
  return (res.text ?? "").replace(/^["']|["']$/g, "").trim();
}

function buildImagenPrompt(scene: string, aspectRatio: string): string {
  // Deliberately written in positive, visual language only.
  // No hex codes (Imagen prints them as text). No brand name (Imagen tries
  // to render it as a logo). No "no text" rule (mentioning text triggers it).
  return `Editorial flat illustration with subtle dimension and grain.

Scene: ${scene}

Visual style:
A two-color palette only. Deep emerald forest green for primary shapes, vivid citrus lime green for highlights and accents. Background and neutrals in either warm cream paper or deep charcoal ink. No other hues. Soft drop shadows. Hand-drawn line quality.

Composition:
Documentary observational angle, as if a passerby caught the moment. Tight on the object. The objects fill the frame; they are the subject. The scene is wordless and silent — purely a still life of the thing.

Render quality:
Editorial, modern, calm, confident. Like a New York Times opinion-page illustration. Not 3D rendered. Not cartoonish. Not stock photo. Not generic fintech gradient. ${aspectRatio} aspect ratio.

Typography:
If any incidental lettering appears in the scene (a receipt header, an app screen label, a button caption), it is rendered in clean English using the standard Latin alphabet. No Arabic script, no Cyrillic, no Chinese / Japanese / Korean characters, no decorative foreign typography, no garbled or invented characters. US-style English only.`;
}

export async function generatePostImage(topic: string, platform: Platform): Promise<string> {
  const client = getClient();
  const aspect = ASPECTS[platform];

  let scene: string;
  try {
    scene = await describeScene(client, topic);
    if (!scene) throw new Error("Gemini returned empty scene description");
  } catch (err) {
    throw new Error(
      `Scene description failed [${platform}, "${topic}"]: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const prompt = buildImagenPrompt(scene, aspect.aspectRatio);

  let response;
  try {
    response = await withRetry(
      () => client.models.generateImages({
        model: IMAGEN_MODEL,
        prompt,
        config: { numberOfImages: 1, aspectRatio: aspect.aspectRatio },
      }),
      { label: `imagen [${platform}]` },
    );
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
