import { prisma } from "../src/lib/db";

async function main() {
  const email = process.argv[2] || "coryloomis79@gmail.com";
  const contact = await prisma.contact.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: {
      application: { select: { applicationCode: true, status: true, createdAt: true, platform: true, loanAmount: true } },
      activities: { orderBy: { createdAt: "asc" }, take: 5 },
    },
  });
  if (!contact) { console.log("No contact found for", email); await prisma.$disconnect(); return; }

  console.log("===", contact.firstName, contact.lastName, "===");
  console.log("Email:", contact.email);
  console.log("Phone:", contact.phone);
  console.log("Stage:", contact.stage);
  console.log("Created:", contact.createdAt);
  console.log("");
  console.log("--- Attribution ---");
  console.log("source:           ", contact.source);
  console.log("utmSource:        ", contact.utmSource);
  console.log("utmCampaign:      ", contact.utmCampaign);
  console.log("utmMedium:        ", contact.utmMedium);
  console.log("utmTerm:          ", contact.utmTerm);
  console.log("utmContent:       ", contact.utmContent);
  console.log("gclid:            ", contact.gclid);
  console.log("fbclid:           ", contact.fbclid);
  console.log("ttclid:           ", contact.ttclid);
  console.log("msclkid:          ", contact.msclkid);
  console.log("pennyClickId:     ", contact.pennyClickId);
  console.log("landingPage:      ", contact.landingPage);
  console.log("referrer:         ", contact.referrer);
  console.log("");
  console.log("--- Application ---");
  console.log(contact.application ?? "(no application)");
  console.log("");
  console.log("--- First 5 activities ---");
  for (const a of contact.activities) {
    console.log(`  ${a.createdAt.toISOString()} · ${a.type} · ${a.title}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
