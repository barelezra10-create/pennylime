import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL || "") });

const TOPICS: Array<{ topic: string; category: string }> = [
  // tax
  { topic: "How to track Uber/Lyft mileage for tax deductions", category: "tax" },
  { topic: "Quarterly estimated taxes for gig workers: exactly how much to set aside", category: "tax" },
  { topic: "1099 vs W-2: what gig workers need to know at tax time", category: "tax" },
  { topic: "Top 7 tax deductions DoorDash drivers miss every year", category: "tax" },
  { topic: "Standard mileage vs actual expense: which saves gig drivers more?", category: "tax" },
  { topic: "How to file a Schedule C for gig income (step by step)", category: "tax" },
  { topic: "Self-employment tax explained for first-time gig workers", category: "tax" },
  { topic: "Can you write off your phone bill as an Uber driver? (Yes, here's how much)", category: "tax" },
  { topic: "Hot bag, car wash, dash cam: surprising DoorDash deductions", category: "tax" },
  { topic: "What to do if you forgot to track miles for the year", category: "tax" },

  // cashflow
  { topic: "Smoothing variable income: the 50/30/20 rule for gig workers", category: "cashflow" },
  { topic: "How to budget when your weekly pay swings $300-$1,200", category: "cashflow" },
  { topic: "Building a 1-month buffer on gig income (without working 80hr weeks)", category: "cashflow" },
  { topic: "Why gig workers should pay themselves a salary from a buffer account", category: "cashflow" },
  { topic: "The 3-account system for gig workers (operating / tax / personal)", category: "cashflow" },
  { topic: "How to handle a slow week when rent is due in 5 days", category: "cashflow" },
  { topic: "Cash advance vs payday loan vs credit card: costs compared", category: "cashflow" },
  { topic: "Why $300 today can cost you $90 tomorrow (and how to avoid it)", category: "cashflow" },
  { topic: "Bridging the gap between Uber payouts (Tuesday vs daily cashout)", category: "cashflow" },
  { topic: "How to use Plaid-connected apps to predict your slow weeks", category: "cashflow" },

  // platform-tips
  { topic: "Top 5 surge windows for Uber drivers in 2026 (data-backed)", category: "platform-tips" },
  { topic: "Multi-apping: how to stack DoorDash + Uber Eats + Grubhub safely", category: "platform-tips" },
  { topic: "Acceptance rate vs cancellation rate: which actually matters", category: "platform-tips" },
  { topic: "Hidden DoorDash hot zones: how to find them in your city", category: "platform-tips" },
  { topic: "Lyft Power Driver tier: is it worth chasing in 2026?", category: "platform-tips" },
  { topic: "Why declining short Uber trips is hurting your hourly rate", category: "platform-tips" },
  { topic: "Instacart batch quality: read the order before accepting", category: "platform-tips" },
  { topic: "Uber Pro Diamond perks ranked from use daily to never", category: "platform-tips" },
  { topic: "How to handle a low rating (and when to ask Uber to remove it)", category: "platform-tips" },
  { topic: "Best times to drive on Sunday: a city-by-city breakdown", category: "platform-tips" },

  // earnings
  { topic: "Why your hourly rate looks great until you subtract gas and depreciation", category: "earnings" },
  { topic: "True cost per mile: the calculation Uber doesn't show you", category: "earnings" },
  { topic: "Hybrid vs gas vs EV: which actually pays best for rideshare in 2026", category: "earnings" },
  { topic: "Tipping breakdown: when DoorDash riders actually tip well", category: "earnings" },
  { topic: "How long-distance trips really pay (the dead-mile problem)", category: "earnings" },
  { topic: "Should you pay $40 for a car wash to keep your 4.99 rating?", category: "earnings" },
  { topic: "Gas card stacking: Upside + Costco + GetUpside in 2026", category: "earnings" },
  { topic: "Tire wear math: how many miles before tires eat your weekly profit", category: "earnings" },
  { topic: "Insurance gotchas: rideshare endorsement vs commercial policy", category: "earnings" },
  { topic: "Tracking your real take-home with one simple weekly spreadsheet", category: "earnings" },

  // savings
  { topic: "Building an emergency fund on gig income (a 90-day plan)", category: "savings" },
  { topic: "Why gig workers need a Roth IRA more than W-2 workers do", category: "savings" },
  { topic: "Solo 401(k) for full-time DoorDashers: how the math works", category: "savings" },
  { topic: "HSA accounts for self-employed gig workers: overlooked superpower", category: "savings" },
  { topic: "How to save for a car upgrade without killing your operating cash", category: "savings" },
  { topic: "The pay yourself first rule, adapted for daily Uber payouts", category: "savings" },
  { topic: "When a high-yield savings account beats your Uber Pro debit card", category: "savings" },
  { topic: "Emergency fund vs cash advance: when each one wins", category: "savings" },
  { topic: "How $50/week saved on gas equals $2,600 a year (compound interest math)", category: "savings" },
  { topic: "Why most gig workers are underinsured, and what to fix first", category: "savings" },
];

async function main() {
  let inserted = 0;
  for (const t of TOPICS) {
    const exists = await prisma.topicPool.findFirst({ where: { topic: t.topic } });
    if (exists) continue;
    await prisma.topicPool.create({ data: { topic: t.topic, category: t.category } });
    inserted++;
  }
  console.log(`Seeded ${inserted} topics (${TOPICS.length - inserted} already existed)`);
}

main().finally(() => prisma.$disconnect());
