import { GoogleGenAI } from "@google/genai";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDS5nGyVIErg7eEU20iMOr7X9h0LIat1nE";
const ai = new GoogleGenAI({ apiKey: API_KEY });
const OUTPUT_DIR = join(process.cwd(), "public", "illustrations");

const STYLE_PREFIX =
  "Hand-drawn organic illustration, warm sketchy line art with imperfect strokes, sage green (#15803d) and warm cream color palette, soft charcoal outlines, approachable and human feel, pure white background, no text, no watermarks, minimalist";

const illustrations: { name: string; prompt: string }[] = [
  {
    name: "hero-gig-worker",
    prompt:
      "A delivery rider on a bicycle with a phone, wearing a backpack, moving fast through a city, energetic and optimistic",
  },
  {
    name: "problem-closed-door",
    prompt:
      "A closed ornate bank door with a small gig worker figure standing outside looking up at it, feeling excluded from traditional finance",
  },
  {
    name: "step-1-apply",
    prompt:
      "A young person sitting casually on a bench filling out a form on their smartphone, relaxed and easy posture",
  },
  {
    name: "step-2-approved",
    prompt:
      "A stack of bank statement documents with a large friendly green checkmark stamp overlaid, clean and reassuring",
  },
  {
    name: "step-3-funded",
    prompt:
      "Dollar bills flowing like confetti into a smartphone screen, celebratory mood, sparkles and stars around it",
  },
  {
    name: "platform-rideshare",
    prompt:
      "A friendly rideshare driver sitting in a car waving at passengers, urban background, warm smile",
  },
  {
    name: "platform-delivery",
    prompt:
      "A delivery person on a bicycle carrying a food delivery bag, motion lines showing speed, city scene",
  },
  {
    name: "platform-shopping",
    prompt:
      "A personal shopper in a grocery store pushing a cart filled with items, checking their phone for the order list",
  },
  {
    name: "platform-freelance",
    prompt:
      "A freelance creative working on a laptop at a coffee shop, focused and productive, warm lighting",
  },
  {
    name: "social-proof-stars",
    prompt:
      "Five large stars arranged in a row with sparkles and decorative elements around them, celebration of quality and achievement",
  },
  {
    name: "why-no-credit-check",
    prompt:
      "A credit score report being torn in half gently, with a cheerful green checkmark replacing it, representing freedom from credit checks",
  },
  {
    name: "why-fast-funding",
    prompt:
      "A lightning bolt shape with dollar signs around it, energy and speed, representing fast money transfer",
  },
  {
    name: "why-built-for-1099",
    prompt:
      "A handshake between two diverse hands with a small 1099 tax form between them, partnership and understanding",
  },
  {
    name: "faq-question",
    prompt:
      "A friendly oversized question mark bubble floating, curious and approachable mood, decorative",
  },
  {
    name: "final-cta-arrow",
    prompt:
      "A large hand-drawn curved arrow pointing to the right with small stars and squiggles around it, bold and inviting",
  },
  {
    name: "blog-header",
    prompt:
      "An open book with a lightbulb floating above it emitting gentle rays, knowledge and insight theme",
  },
  {
    name: "tool-calculator",
    prompt:
      "A calculator surrounded by gold coins and dollar bills, financial planning and math theme, friendly",
  },
  {
    name: "tool-chart",
    prompt:
      "A bar chart growing upward with a dollar sign on top, income growth and earnings theme, positive trajectory",
  },
];

async function generateOne(name: string, prompt: string): Promise<boolean> {
  try {
    console.log(`Generating: ${name}...`);
    const response = await ai.models.generateImages({
      model: "imagen-4.0-fast-generate-001",
      prompt: `${STYLE_PREFIX}. ${prompt}`,
      config: {
        numberOfImages: 1,
        aspectRatio: "1:1",
      },
    });

    const img = response.generatedImages?.[0]?.image;
    if (img?.imageBytes) {
      const buf = Buffer.from(img.imageBytes as string, "base64");
      const filePath = join(OUTPUT_DIR, `${name}.png`);
      await writeFile(filePath, buf);
      console.log(`  ✓ ${filePath}`);
      return true;
    }
    console.log(`  ✗ No image data returned for ${name}`);
    return false;
  } catch (error) {
    console.error(
      `  ✗ Error: ${name}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  console.log(
    `Generating ${illustrations.length} illustrations to ${OUTPUT_DIR}\n`
  );

  let ok = 0;
  for (const ill of illustrations) {
    const success = await generateOne(ill.name, ill.prompt);
    if (success) ok++;
    await new Promise((r) => setTimeout(r, 2000)); // rate limit
  }

  console.log(`\nDone: ${ok}/${illustrations.length}`);
}

main().catch(console.error);
