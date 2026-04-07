import { GoogleGenAI } from "@google/genai";
import { writeFile, mkdir, access } from "fs/promises";
import { join } from "path";

const API_KEY = process.env.GEMINI_API_KEY || "AIzaSyAI43FpDllHxvhW5myKdAkIbs5zAIEmDVw";
const ai = new GoogleGenAI({ apiKey: API_KEY });
const OUTPUT_DIR = join(process.cwd(), "public", "blog-images");

// STRICT consistent style - every image looks like it belongs to the same set
const STYLE = `Isometric 3D illustration on a pure white background. Objects float with soft shadows underneath. Color palette ONLY: lime green (#4ade80), dark green (#15803d), cream (#faf8f0), light gray (#f4f4f5), white. Rounded soft shapes, no sharp edges. Minimal, clean, modern fintech aesthetic. NO text, NO watermarks, NO people, NO faces. Only objects and icons. Soft ambient lighting from top-left.`;

const ARTICLES: { slug: string; objects: string }[] = [
  { slug: "1099-loans-complete-guide-gig-workers", objects: "A 1099 tax form, a green checkmark badge, stacked coins, a small laptop showing a form" },
  { slug: "amazon-flex-loans-delivery-income", objects: "Cardboard delivery boxes stacked, a van, a phone showing earnings, dollar coins" },
  { slug: "apr-explained-gig-workers-guide", objects: "A large percentage symbol, a calculator, a magnifying glass, interest rate chart" },
  { slug: "bank-statement-loans-explained-gig-workers", objects: "Bank statement papers, a green APPROVED stamp, deposit slips, no W-2 with X mark" },
  { slug: "cosigner-gig-worker-loan-pros-cons-risks", objects: "Two pens signing a document, a handshake icon, a balance scale, pros/cons checklist" },
  { slug: "credit-score-guide-1099-workers", objects: "A speedometer/gauge showing high score, upward arrow, credit card, green bar chart" },
  { slug: "debt-to-income-ratio-gig-workers", objects: "A balance scale with coins on both sides, pie chart, calculator, ratio gauge" },
  { slug: "doordash-driver-loans-how-to-qualify", objects: "Food delivery bag, bicycle, phone with app, green approval badge, dollar bills" },
  { slug: "emergency-fund-gig-worker-how-to-build", objects: "Piggy bank, coins dropping in, safety net, umbrella, savings jar filling up" },
  { slug: "emergency-loan-uber-driver", objects: "Car with open hood, wrench, emergency money envelope, clock showing urgency, green lightning bolt" },
  { slug: "fiverr-income-freelancer-personal-loans", objects: "Laptop with design tools, creative palette, gig order cards, money flowing from screen" },
  { slug: "gig-work-retirement-savings-sep-ira-solo-401k", objects: "Nest egg, gold coins growing, calendar showing future, retirement jar, growth plant" },
  { slug: "gig-worker-financial-planning-money-roadmap", objects: "Road map with green pins, milestone flags, compass, mountain with dollar at peak" },
  { slug: "gig-worker-guide-building-business-credit", objects: "Building blocks stacking up, credit card, upward trend line, construction crane, green bricks" },
  { slug: "gig-worker-insurance-what-you-need", objects: "Shield with checkmark, insurance policy document, umbrella, car and health cross icons" },
  { slug: "gig-worker-tax-deductions-complete-list-2024", objects: "Checklist with green checkmarks, scissors cutting a tax bill, receipt tape, calculator" },
  { slug: "gig-workers-business-loans-complete-guide", objects: "Signpost with multiple arrow directions, briefcase, loan documents, key, green door opening" },
  { slug: "grubhub-doordash-ubereats-best-platform-drivers", objects: "Three food delivery bags side by side, VS badges, star ratings, comparison chart" },
  { slug: "income-tax-basics-new-1099-workers-first-year", objects: "Graduation cap on a tax form, ABC blocks, step 1-2-3 markers, beginner badge" },
  { slug: "loan-approval-tips-gig-workers", objects: "Target bullseye with arrow in center, lightbulb, thumbs up badge, green ribbon" },
  { slug: "lyft-vs-uber-which-pays-more-2024", objects: "Two cars side by side, dollar signs comparing, trophy cup, racing flags, scoreboard" },
  { slug: "maximize-instacart-earnings-tips", objects: "Shopping cart overflowing with green items, upward earnings graph, star badge, smartphone" },
  { slug: "non-qm-loans-self-employed-guide", objects: "A door opening with green light, key unlocking, alternative path arrows, document with new stamp" },
  { slug: "pennylime-vs-payday-loans-difference-matters", objects: "Split scene: left has red warning sign and chains, right has green shield and handshake icon" },
  { slug: "postmates-vs-doordash-delivery-drivers", objects: "Two delivery bikes, food bags, stopwatch, comparison arrows, city buildings" },
  { slug: "quarterly-taxes-gig-workers-guide", objects: "Calendar with 4 quarters highlighted in green, tax envelopes, calculator, clock" },
  { slug: "refinancing-loan-gig-worker-when-how", objects: "Document with refresh arrows, lower rate badge, green downward interest arrow, new loan paper" },
  { slug: "rover-pet-sitter-loans-pet-care-income", objects: "Dog leash, pet bowl, paw prints, green coins, phone with booking app, park bench" },
  { slug: "self-employed-health-insurance-gig-workers", objects: "Medical cross in a shield, stethoscope, health card, green protection bubble" },
  { slug: "shipt-shopper-loan-guide", objects: "Grocery bags, shopping list on phone, receipt tape, green earnings badge, store cart" },
  { slug: "taskrabbit-taskers-financial-tips", objects: "Toolbox with hammer and drill, completed task checkboxes, coins, wrench, green badge" },
  { slug: "thumbtack-pro-loans-home-services-business", objects: "Plumbing wrench, paint roller, small house, business growth chart, green funding arrow" },
  { slug: "turo-host-loans-car-rental-income", objects: "Car with key and FOR RENT tag, passive income coins, phone dashboard, calendar" },
  { slug: "upwork-freelancers-loan-approval-contract-income", objects: "Laptop with contract, milestone progress bar, payment checks, green approved stamp" },
  { slug: "what-happens-default-gig-worker-loan", objects: "Warning triangle, red X on document, late fee clock, but also a green recovery path arrow" },
];

async function generateOne(slug: string, objects: string, retries = 2): Promise<boolean> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) console.log(`  Retry ${attempt}...`);
      const r = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: `Generate an image: ${STYLE} Objects in the scene: ${objects}`,
        config: {
          responseModalities: ["IMAGE", "TEXT"],
        },
      });
      const parts = r.candidates?.[0]?.content?.parts;
      if (parts) {
        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith("image/")) {
            const buf = Buffer.from(part.inlineData.data!, "base64");
            await writeFile(join(OUTPUT_DIR, `${slug}.png`), buf);
            return true;
          }
        }
      }
      if (attempt < retries) await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      if (attempt < retries) await new Promise((r) => setTimeout(r, 3000));
      else console.error(`  FAIL after ${retries + 1} attempts: ${e instanceof Error ? e.message : e}`);
    }
  }
  return false;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Skip if all images already exist
  let existingCount = 0;
  for (const a of ARTICLES) {
    try { await access(join(OUTPUT_DIR, `${a.slug}.png`)); existingCount++; } catch {}
  }
  if (existingCount === ARTICLES.length) {
    console.log(`All ${ARTICLES.length} blog images exist. Skipping.`);
    return;
  }

  console.log(`Generating ${ARTICLES.length} blog images (${existingCount} already exist)...\n`);

  let ok = 0;
  for (const a of ARTICLES) {
    // Skip if already exists
    try { await access(join(OUTPUT_DIR, `${a.slug}.png`)); ok++; console.log(`[${a.slug}] exists, skip`); continue; } catch {}

    process.stdout.write(`[${a.slug}] `);
    if (await generateOne(a.slug, a.objects)) { ok++; console.log("OK"); }
    else console.log("FAILED");
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\nDone: ${ok}/${ARTICLES.length}`);
}

main().catch(console.error);
