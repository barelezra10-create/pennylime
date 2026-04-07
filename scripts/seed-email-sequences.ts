import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const SEQUENCES = [
  {
    name: "Abandoned App Recovery",
    description: "Emails sent to contacts who started but didn't finish their application",
    triggerType: "abandoned_app",
    active: true,
    steps: [
      { id: "ab-1", order: 0, subject: "Hey {firstName}, you're almost done", body: "<h2>You were so close!</h2><p>You started your PennyLime application but didn't finish. It only takes 5 more minutes to complete.</p><p>Your loan amount is still reserved. Pick up where you left off:</p><p><a href='https://pennylime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Complete My Application</a></p>", delayAmount: 1, delayUnit: "hours" },
      { id: "ab-2", order: 1, subject: "Still need that cash, {firstName}?", body: "<h2>Don't let this slip away</h2><p>We've held your spot. Most gig workers get funded within 48 hours of applying.</p><p>No credit check. No W-2. Just your platform earnings.</p><p><a href='https://pennylime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Finish Applying</a></p>", delayAmount: 24, delayUnit: "hours" },
      { id: "ab-3", order: 2, subject: "Last chance to get funded, {firstName}", body: "<h2>Your application is about to expire</h2><p>We keep incomplete applications for 7 days. After that, you'll need to start over.</p><p>5 minutes is all it takes to get funded. Uber, Lyft, DoorDash drivers - we built this for you.</p><p><a href='https://pennylime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Complete Now</a></p>", delayAmount: 7, delayUnit: "days" },
    ],
  },
  {
    name: "Application Submitted",
    description: "Confirmation email after application is submitted",
    triggerType: "stage_change",
    triggerValue: "APPLICANT",
    active: true,
    steps: [
      { id: "sub-1", order: 0, subject: "Application received, {firstName}!", body: "<h2>We got your application!</h2><p>Thanks for applying with PennyLime. We're reviewing your earnings now.</p><p>Most decisions are made within a few hours. We'll email you as soon as there's an update.</p><p>In the meantime, here's what happens next:</p><ul><li>We verify your platform earnings (no credit check)</li><li>You'll get an approval decision via email</li><li>If approved, funds hit your account in 24-48 hours</li></ul>", delayAmount: 0, delayUnit: "hours" },
    ],
  },
  {
    name: "Loan Funded",
    description: "Celebration email after loan is funded",
    triggerType: "stage_change",
    triggerValue: "FUNDED",
    active: true,
    steps: [
      { id: "fund-1", order: 0, subject: "You're funded, {firstName}!", body: "<h2>Cash is on the way!</h2><p>Your loan has been funded and is being transferred to your bank account.</p><p>Expect to see the funds within 24-48 hours.</p><p>Keep driving, keep earning. We've got your back.</p>", delayAmount: 0, delayUnit: "hours" },
    ],
  },
  {
    name: "Re-engagement",
    description: "Win back cold contacts after 30 days of inactivity",
    triggerType: "manual",
    active: false,
    steps: [
      { id: "re-1", order: 0, subject: "We miss you, {firstName}", body: "<h2>Still need a loan?</h2><p>It's been a while since we heard from you. Life as a gig worker doesn't slow down, and neither do we.</p><p>PennyLime is here whenever you're ready. $100 to $10,000, no credit check.</p><p><a href='https://pennylime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Apply Now</a></p>", delayAmount: 0, delayUnit: "hours" },
      { id: "re-2", order: 1, subject: "Special offer for {firstName}", body: "<h2>Come back and save</h2><p>As a returning applicant, you may qualify for reduced fees on your next loan. Apply today to find out.</p><p><a href='https://pennylime.com/apply' style='display:inline-block;background:#15803d;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;'>Check My Rate</a></p>", delayAmount: 15, delayUnit: "days" },
    ],
  },
];

async function main() {
  console.log("Seeding email sequences...");

  for (const seq of SEQUENCES) {
    const existing = await prisma.emailSequence.findFirst({ where: { name: seq.name } });
    if (existing && process.env.SEED_FORCE !== "true") {
      console.log(`  Skipping "${seq.name}" (exists)`);
      continue;
    }
    if (existing) {
      await prisma.emailSequence.delete({ where: { id: existing.id } });
    }
    await prisma.emailSequence.create({
      data: {
        name: seq.name,
        description: seq.description,
        triggerType: seq.triggerType,
        triggerValue: (seq as { triggerValue?: string }).triggerValue || null,
        active: seq.active,
        steps: JSON.stringify(seq.steps),
      },
    });
    console.log(`  Created: ${seq.name}`);
  }

  console.log("Done.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
