// Generate hero images for the 30 May 2026 content-velocity articles.
// Mirrors scripts/generate-blog-images.ts: same isometric style on white,
// lime green palette, no people/text/watermarks. Writes to
// public/blog-images/{slug}.png so the file ships with the next deploy.
//
// Requires GEMINI_API_KEY in env. Run:
//   GEMINI_API_KEY=... npx tsx scripts/generate-blog-images-batch2.ts

import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { writeFile, mkdir, access } from "fs/promises";
import { join } from "path";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY in env");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: API_KEY });
const OUTPUT_DIR = join(process.cwd(), "public", "blog-images");

const STYLE = `Isometric 3D illustration on a pure white background. Objects float with soft shadows underneath. Color palette ONLY: lime green (#4ade80), dark green (#15803d), cream (#faf8f0), light gray (#f4f4f5), white. Rounded soft shapes, no sharp edges. Minimal, clean, modern fintech aesthetic. NO text, NO watermarks, NO people, NO faces. Only objects and icons. Soft ambient lighting from top-left.`;

const ARTICLES: { slug: string; objects: string }[] = [
  // Batch 1: cash-advance comparisons
  { slug: "earnin-vs-pennylime-cash-advance-gig-workers", objects: "Two phones side by side showing app screens, balance scale with coins, comparison checklist, green VS badge between them" },
  { slug: "dave-vs-pennylime-cash-advance-comparison", objects: "Two cash advance app icons facing each other, dollar amount tags ($500 and $10000), green comparison arrows, pros and cons cards" },
  { slug: "moneylion-vs-pennylime-cash-advance-1099", objects: "1099 tax form, two payment app icons on either side, balance scale tilting toward larger stack of bills, green winning ribbon" },
  { slug: "brigit-vs-pennylime-cash-advance-comparison", objects: "Bridge icon connecting two phones, small coin stack on left and tall coin stack on right, comparison ledger, green check on the right" },
  { slug: "best-cash-advance-apps-doordash-drivers", objects: "DoorDash-style delivery bag, ranked podium with 1-2-3, app icon stack with green badges, dollar coins, smartphone showing rankings" },
  // Batch 2: cash-advance edge cases
  { slug: "cash-advance-vs-personal-loan-gig-workers", objects: "Split scene: left side has loan document with calendar, right side has cash advance receipt with weekly remittance icons, green divider arrow" },
  { slug: "cash-advance-bad-credit-gig-worker", objects: "Bank statement papers with green checkmarks, broken credit score gauge crossed out, Plaid-style connection icon, dollar stack with approved stamp" },
  { slug: "payday-alternative-gig-workers-cash-advance", objects: "Calendar showing 12 weeks of small payments, red X over balloon payment icon, green shield, structured remittance bars rising" },
  { slug: "same-day-funding-cash-advance-1099", objects: "Clock showing 24 hours, ACH transfer arrow into bank icon, lightning bolt, green checkmark with TODAY tag, cash piles" },
  { slug: "no-credit-check-cash-advance-gig-workers", objects: "Credit report with eyes-closed icon, bank statements highlighted instead, Plaid lock icon, green approval stamp, dollar stack" },
  // Batch 3: tax + bookkeeping
  { slug: "schedule-c-gig-workers-complete-walkthrough", objects: "IRS Schedule C form, green checkmark steps 1-2-3, calculator, pencil checking boxes, receipt tape spilling out" },
  { slug: "mileage-deduction-vs-actual-expense-gig-drivers", objects: "Car odometer, fuel pump, gas receipts, calculator with 70 cents per mile, green comparison arrows between two methods" },
  { slug: "best-mileage-tracking-apps-gig-drivers-2026", objects: "Smartphone with route map, GPS pin, mileage counter, app icons in a row, green route line on white background" },
  { slug: "llc-vs-sole-proprietorship-gig-workers", objects: "Two business card shapes side by side: LLC card with shield icon, sole prop card with simple person icon, comparison ledger, green pros/cons checklist" },
  { slug: "quarterly-estimated-taxes-gig-workers-how-to", objects: "Calendar with 4 quarters highlighted in green (April, June, Sept, Jan), tax form, calculator, envelope with green check" },
  { slug: "self-employment-tax-explained-gig-workers", objects: "Percentage symbol 15.3%, two pie slices (Social Security and Medicare), calculator showing math, green explanatory arrow pointing to total" },
  { slug: "home-office-deduction-gig-workers", objects: "Small house outline, desk and laptop inside, square measuring tape showing 300 sqft, green checkmark or red X depending on qualification, calculator" },
  { slug: "vehicle-depreciation-gig-drivers-taxes", objects: "Car icon with value bars decreasing year over year, calculator, IRS Section 179 document, green tax savings arrow" },
  // Batch 4: platforms + earnings
  { slug: "how-much-do-uber-drivers-make-per-hour-2026", objects: "Sedan car icon, clock showing hour hand, dollar amount with $/hour label, earnings bar chart rising, calculator" },
  { slug: "how-much-do-doordash-drivers-make-per-hour-2026", objects: "Delivery bag, scooter icon, dollar per hour gauge, bar chart of earnings by hour, smartphone showing in-app earnings" },
  { slug: "multi-app-strategy-uber-lyft-doordash", objects: "Three app icons arranged in triangle (rideshare, rideshare, delivery), smartphone juggling between them, traffic signal switching, green strategy arrows" },
  { slug: "best-hours-drive-uber-max-earnings", objects: "Clock face with 5pm-2am highlighted in green, surge multiplier icon, weekend calendar marked, city skyline with lights" },
  { slug: "acceptance-rate-vs-completion-rate-gig-drivers", objects: "Two percentage gauges side by side, green checkmark on completion gauge, comparison ledger, smartphone showing driver dashboard stats" },
  { slug: "hidden-fees-gig-workers-pay-platforms", objects: "Magnifying glass over a receipt with multiple line items highlighted, dollar bills with arrows pointing away, calculator, red warning icon" },
  // Batch 5: credit + long-term
  { slug: "build-credit-as-gig-worker-no-w2", objects: "Credit score gauge rising, brick wall building up with green bricks, secured credit card icon, rent payment receipt, credit report" },
  { slug: "best-credit-cards-gig-workers-2026", objects: "Fan of credit cards in green and dark green, dollar cashback symbols, gas pump icon, podium ranking 1-2-3, green winner ribbon" },
  { slug: "mortgage-approval-1099-gig-workers", objects: "Small house with keys, bank statements stack, calculator showing DTI ratio, mortgage application document with approved stamp, green checkmark" },
  { slug: "auto-loan-approval-gig-worker", objects: "Car with key, loan document, bank statement with deposits highlighted, calculator, dollar amount tag, green approval badge" },
  { slug: "business-credit-cards-gig-workers", objects: "Business credit card with EIN tag, briefcase, separate stacks of personal vs business expenses, green divider, growth chart" },
  { slug: "renting-apartment-1099-income-only", objects: "Apartment building outline, lease document, bank statements with deposits, key icon, dollar bills with 3x rent calculation, green approved stamp" },
];

async function generateOne(slug: string, objects: string, retries = 2): Promise<boolean> {
  const prompt = `${STYLE}\n\nScene to illustrate: ${objects}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
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

  let existingCount = 0;
  for (const a of ARTICLES) {
    try { await access(join(OUTPUT_DIR, `${a.slug}.png`)); existingCount++; } catch {}
  }

  console.log(`Generating ${ARTICLES.length} images (${existingCount} already exist)...\n`);

  let ok = 0;
  for (const a of ARTICLES) {
    try {
      await access(join(OUTPUT_DIR, `${a.slug}.png`));
      ok++;
      console.log(`[${a.slug}] exists, skip`);
      continue;
    } catch {}

    process.stdout.write(`[${a.slug}] `);
    if (await generateOne(a.slug, a.objects)) {
      ok++;
      console.log("OK");
    } else {
      console.log("FAILED");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\nDone: ${ok}/${ARTICLES.length}`);
}

main().catch(console.error);
