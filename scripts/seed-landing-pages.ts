import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const SLUG = "uber-lyft-driver-loans";
const FORCE = process.env.SEED_FORCE === "true";

async function main() {
  const existing = await prisma.landingPage.findUnique({ where: { slug: SLUG } });
  // Re-seed if content has dashes (v2 cleanup)
  const needsUpdate = existing?.heroSubtext?.includes("\u2013") || existing?.heroSubtext?.includes("\u2014");
  if (existing && !FORCE && !needsUpdate) {
    console.log(`Landing page "${SLUG}" already exists (v2). Skipping.`);
    return;
  }

  if (existing && FORCE) {
    await prisma.landingPage.delete({ where: { slug: SLUG } });
    console.log(`Deleted existing landing page "${SLUG}" (SEED_FORCE=true)`);
  }

  await prisma.landingPage.create({
    data: {
      slug: SLUG,
      metaTitle: "Loans for Uber & Lyft Drivers | $100 - $10,000 | PennyLime",
      metaDescription:
        "Fast loans for rideshare drivers. $100 to $10,000. No credit check. Same-day decisions. Built for Uber and Lyft drivers. Apply in 5 minutes.",
      phoneNumber: "1-800-555-1234",
      heroBadge: "Hey Uber & Lyft driver",
      heroHeadlineLine1: "Uber driver?",
      heroHeadlineLine2: "Lyft driver?",
      heroHeadlineLine3: "We got you.",
      heroSubtext:
        "$100 to $10,000 in your account. No credit check. Same-day decisions. We verify your Uber and Lyft earnings, not your credit score.",
      heroIllustration: "/illustrations/platform-rideshare.png",
      trustItems: JSON.stringify([
        "No credit check",
        "48-hour funding",
        "No W-2 required",
        "5 min application",
      ]),
      trustStats: JSON.stringify([
        { value: "$2M+", label: "Funded to rideshare drivers" },
        { value: "1,200+", label: "Drivers approved" },
        { value: "48h", label: "Average funding time" },
        { value: "4.8★", label: "Driver rating" },
      ]),
      howItWorksTitle: "Three steps. No paperwork.",
      howItWorksSubtext:
        "We designed the whole process for drivers on the road. Works on your phone between trips.",
      howItWorksSteps: JSON.stringify([
        {
          num: "01",
          title: "Apply in 5 minutes",
          desc: "Tell us your loan amount and basic info. No lengthy forms, no document uploads required upfront.",
          img: "/illustrations/step-1-apply.png",
        },
        {
          num: "02",
          title: "Connect your driving account",
          desc: "We verify your Uber or Lyft earnings directly. Read-only, secure, no credit pull.",
          img: "/illustrations/step-2-approved.png",
        },
        {
          num: "03",
          title: "Cash in your account",
          desc: "Approved loans fund in as little as 24-48 hours. Back on the road, no interruptions.",
          img: "/illustrations/step-3-funded.png",
        },
      ]),
      testimonialsTitle: "Drivers we've funded.",
      testimonials: JSON.stringify([
        {
          quote:
            "Got approved in under 3 hours. My transmission went out and I needed cash fast to get back on the road. PennyLime understood that without the car, there's no income.",
          name: "Marcus T.",
          role: "Uber Driver · Atlanta, GA",
          amount: "$4,200",
        },
        {
          quote:
            "Every other lender wanted W-2s I don't have. PennyLime just looked at my Lyft earnings. Applied Monday, funded Wednesday. Simple.",
          name: "Sofia R.",
          role: "Lyft Driver · Phoenix, AZ",
          amount: "$3,500",
        },
        {
          quote:
            "Needed new tires and an oil change to keep driving. Slow week meant I couldn't cover it out of pocket. Got $1,500 same day. Back to full-time by Friday.",
          name: "David K.",
          role: "Uber/Lyft Driver · Chicago, IL",
          amount: "$1,500",
        },
      ]),
      faqTitle: "Rideshare driver questions.",
      faqs: JSON.stringify([
        {
          question: "Do I need a W-2 or pay stubs to qualify?",
          answer:
            "No. We built PennyLime specifically for Uber and Lyft drivers who don't have traditional W-2 income. Instead, we verify your earnings directly from your rideshare account.",
        },
        {
          question: "Will this hurt my credit score?",
          answer:
            "No. We don't pull your credit report. We look at your rideshare earnings, trip history, and account tenure. Your credit score won't be affected by applying.",
        },
        {
          question: "How fast can I get funded?",
          answer:
            "Most rideshare drivers get a decision within hours. Once approved, funds hit your bank account in as little as 24-48 hours.",
        },
        {
          question: "How much can I borrow as a rideshare driver?",
          answer:
            "Loan amounts range from $100 to $10,000. The exact amount depends on your weekly earnings, trip consistency, and how long you've been driving.",
        },
        {
          question: "Can I qualify if I drive for both Uber and Lyft?",
          answer:
            "Yes. We actually prefer multi-platform drivers because it shows consistent earnings. Connect both accounts when you apply for the highest loan amount.",
        },
      ]),
      finalCtaHeadline: "Ready to hit the road\nfully funded?",
      finalCtaSubtext:
        "Join 1,200+ Uber and Lyft drivers who got the cash they needed. No credit check. Decisions in hours.",
      finalCtaButtonText: "Apply for Your Loan",
      utmSource: "lp",
      utmCampaign: "uber-lyft",
      formPlatforms: JSON.stringify(["Uber", "Lyft", "Both"]),
      formTemplateSlug: "uber-lyft-short",
      defaultAmount: 3000,
      defaultTermWeeks: 4,
      published: true,
      publishedAt: new Date(),
    },
  });

  console.log(`Created landing page: /lp/${SLUG}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
