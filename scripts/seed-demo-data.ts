import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const CONTACTS = [
  // FUNDED - success stories
  { firstName: "Marcus", lastName: "Thompson", email: "marcus.t@gmail.com", phone: "(404) 555-1234", stage: "FUNDED", source: "lp:uber-lyft-driver-loans", utmCampaign: "uber-lyft", lastAppStep: 7, tags: ["uber-driver", "funded"], platform: "Uber" },
  { firstName: "Sofia", lastName: "Rodriguez", email: "sofia.r@yahoo.com", phone: "(602) 555-5678", stage: "FUNDED", source: "direct", lastAppStep: 7, tags: ["lyft-driver", "funded"], platform: "Lyft" },
  { firstName: "James", lastName: "Wilson", email: "jwilson88@gmail.com", phone: "(312) 555-9012", stage: "REPAYING", source: "lp:uber-lyft-driver-loans", utmCampaign: "uber-lyft", lastAppStep: 7, tags: ["uber-driver", "multi-platform"], platform: "Uber" },

  // APPROVED - waiting to fund
  { firstName: "Priya", lastName: "Patel", email: "priya.patel@outlook.com", phone: "(646) 555-3456", stage: "APPROVED", source: "organic", lastAppStep: 7, tags: ["doordash-driver"], platform: "DoorDash" },
  { firstName: "David", lastName: "Kim", email: "dkim.delivery@gmail.com", phone: "(213) 555-7890", stage: "APPROVED", source: "lp:uber-lyft-driver-loans", utmCampaign: "uber-lyft", lastAppStep: 7, tags: ["uber-driver", "lyft-driver"], platform: "Uber" },

  // APPLICANT - submitted, reviewing
  { firstName: "Maria", lastName: "Santos", email: "maria.santos@hotmail.com", phone: "(305) 555-2345", stage: "APPLICANT", source: "direct", lastAppStep: 7, tags: ["instacart-shopper"], platform: "Instacart" },
  { firstName: "Tyler", lastName: "Brown", email: "tbrown.flex@gmail.com", phone: "(206) 555-6789", stage: "APPLICANT", source: "organic", lastAppStep: 7, tags: ["amazon-flex"], platform: "Amazon Flex" },
  { firstName: "Ashley", lastName: "Johnson", email: "ash.johnson@gmail.com", phone: "(469) 555-0123", stage: "APPLICANT", source: "direct", lastAppStep: 7, tags: ["grubhub-driver"], platform: "Grubhub" },

  // CONTACTED - rep reached out
  { firstName: "Omar", lastName: "Hassan", email: "omar.h.driver@gmail.com", phone: "(773) 555-4567", stage: "CONTACTED", source: "lp:uber-lyft-driver-loans", utmCampaign: "uber-lyft", lastAppStep: 5, tags: ["uber-driver", "hot-lead"], platform: "Uber" },
  { firstName: "Rachel", lastName: "Chen", email: "rachel.chen.shop@gmail.com", phone: "(415) 555-8901", stage: "CONTACTED", source: "organic", lastAppStep: 4, tags: ["shipt-shopper"], platform: "Shipt" },

  // LEAD - just started
  { firstName: "Kevin", lastName: "Murphy", email: "kmurphy.dash@yahoo.com", phone: "(617) 555-2345", stage: "LEAD", source: "lp:uber-lyft-driver-loans", utmCampaign: "uber-lyft", lastAppStep: 3, tags: ["doordash-driver"], platform: "DoorDash" },
  { firstName: "Jessica", lastName: "Taylor", email: "jess.taylor.rides@gmail.com", phone: "(702) 555-6789", stage: "LEAD", source: "direct", lastAppStep: 2, tags: ["lyft-driver"], platform: "Lyft" },
  { firstName: "Carlos", lastName: "Mendez", email: "carlos.m.task@gmail.com", phone: "(832) 555-0123", stage: "LEAD", source: "organic", lastAppStep: 2, tags: ["taskrabbit"], platform: "TaskRabbit" },
  { firstName: "Aisha", lastName: "Williams", email: "aisha.w.free@outlook.com", phone: "(404) 555-4567", stage: "LEAD", source: "direct", lastAppStep: 1, tags: ["fiverr-freelancer"], platform: "Fiverr" },

  // ABANDONED - started but didn't finish
  { firstName: "Brandon", lastName: "Lee", email: "brandon.lee.drive@gmail.com", phone: "(510) 555-8901", stage: "LEAD", source: "lp:uber-lyft-driver-loans", utmCampaign: "uber-lyft", lastAppStep: 3, tags: ["uber-driver", "abandoned-app"], platform: "Uber" },
  { firstName: "Natalie", lastName: "Davis", email: "nat.davis@yahoo.com", phone: "(480) 555-2345", stage: "LEAD", source: "direct", lastAppStep: 2, tags: ["doordash-driver", "abandoned-app"], platform: "DoorDash" },
  { firstName: "Miguel", lastName: "Rivera", email: "miguel.r.flex@gmail.com", phone: "(214) 555-6789", stage: "LEAD", source: "organic", lastAppStep: 4, tags: ["amazon-flex", "abandoned-app"], platform: "Amazon Flex" },
  { firstName: "Emily", lastName: "Clark", email: "emily.c.shop@gmail.com", phone: "(303) 555-0123", stage: "LEAD", source: "direct", lastAppStep: 1, tags: ["instacart-shopper", "abandoned-app"], platform: "Instacart" },

  // LOST
  { firstName: "Ryan", lastName: "Moore", email: "ryan.moore.gig@gmail.com", phone: "(919) 555-4567", stage: "LOST", source: "direct", lastAppStep: 5, tags: ["uber-driver"], platform: "Uber" },

  // REJECTED
  { firstName: "Stephanie", lastName: "Nguyen", email: "steph.n@hotmail.com", phone: "(503) 555-8901", stage: "REJECTED", source: "organic", lastAppStep: 7, tags: ["upwork-freelancer"], platform: "Upwork" },
];

const ACTIVITY_TEMPLATES: Record<string, { type: string; title: string; details?: string }[]> = {
  FUNDED: [
    { type: "app_started", title: "Application started" },
    { type: "app_step_completed", title: "Completed Step 2: Your Info" },
    { type: "app_step_completed", title: "Completed Step 3: Platforms" },
    { type: "app_step_completed", title: "Completed Step 4: Identity" },
    { type: "app_step_completed", title: "Completed Step 5: Bank Link" },
    { type: "app_step_completed", title: "Completed Step 6: Documents" },
    { type: "app_submitted", title: "Application submitted" },
    { type: "stage_changed", title: "Stage changed to APPLICANT" },
    { type: "stage_changed", title: "Stage changed to APPROVED" },
    { type: "email_sent", title: "Email sent: Application approved!" },
    { type: "stage_changed", title: "Stage changed to FUNDED" },
    { type: "email_sent", title: "Email sent: Your loan has been funded" },
  ],
  REPAYING: [
    { type: "app_started", title: "Application started" },
    { type: "app_submitted", title: "Application submitted" },
    { type: "stage_changed", title: "Stage changed to APPROVED" },
    { type: "stage_changed", title: "Stage changed to FUNDED" },
    { type: "stage_changed", title: "Stage changed to REPAYING" },
    { type: "note_added", title: "First payment received on time", details: "Payment of $312.50 processed via ACH" },
  ],
  APPROVED: [
    { type: "app_started", title: "Application started" },
    { type: "app_submitted", title: "Application submitted" },
    { type: "stage_changed", title: "Stage changed to APPLICANT" },
    { type: "note_added", title: "Reviewed earnings - strong platform history", details: "12 months on platform, consistent weekly earnings" },
    { type: "stage_changed", title: "Stage changed to APPROVED" },
    { type: "email_sent", title: "Email sent: You're approved!" },
  ],
  APPLICANT: [
    { type: "app_started", title: "Application started" },
    { type: "app_submitted", title: "Application submitted" },
    { type: "stage_changed", title: "Stage changed to APPLICANT" },
  ],
  CONTACTED: [
    { type: "app_started", title: "Application started" },
    { type: "app_step_completed", title: "Completed Step 2: Your Info" },
    { type: "tag_added", title: "Tagged as hot-lead" },
    { type: "stage_changed", title: "Stage changed to CONTACTED" },
    { type: "note_added", title: "Called, left voicemail. Will follow up tomorrow.", details: "Phone rang 4 times, went to VM" },
  ],
  LEAD: [
    { type: "app_started", title: "Application started" },
    { type: "app_step_completed", title: "Completed Step 2: Your Info" },
  ],
  LOST: [
    { type: "app_started", title: "Application started" },
    { type: "app_step_completed", title: "Completed Step 2: Your Info" },
    { type: "stage_changed", title: "Stage changed to CONTACTED" },
    { type: "note_added", title: "No longer interested, found other financing", details: "Spoke on phone, decided to go with bank loan" },
    { type: "stage_changed", title: "Stage changed to LOST" },
  ],
  REJECTED: [
    { type: "app_started", title: "Application started" },
    { type: "app_submitted", title: "Application submitted" },
    { type: "stage_changed", title: "Stage changed to APPLICANT" },
    { type: "note_added", title: "Insufficient platform earnings history", details: "Only 2 months on Upwork, need minimum 6 months" },
    { type: "stage_changed", title: "Stage changed to REJECTED" },
    { type: "email_sent", title: "Email sent: Application update" },
  ],
};

async function main() {
  console.log("Seeding demo CRM data...");

  // Check if demo data already exists
  const existing = await prisma.contact.count();
  if (existing > 0 && process.env.SEED_FORCE !== "true") {
    console.log(`${existing} contacts already exist. Skipping demo data. Set SEED_FORCE=true to re-seed.`);
    await prisma.$disconnect();
    return;
  }

  // Clear existing CRM data
  if (existing > 0) {
    console.log("Clearing existing CRM data...");
    await prisma.activity.deleteMany();
    await prisma.contactTag.deleteMany();
    await prisma.sequenceEnrollment.deleteMany();
    await prisma.emailEvent.deleteMany();
    await prisma.contact.deleteMany();
  }

  console.log(`Creating ${CONTACTS.length} demo contacts...`);

  for (const c of CONTACTS) {
    // Create contact
    const daysAgo = Math.floor(Math.random() * 30) + 1;
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    const contact = await prisma.contact.create({
      data: {
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        stage: c.stage,
        source: c.source,
        utmCampaign: c.utmCampaign || null,
        utmSource: c.utmCampaign ? "lp" : null,
        lastAppStep: c.lastAppStep,
        createdAt,
        updatedAt: new Date(createdAt.getTime() + Math.random() * daysAgo * 24 * 60 * 60 * 1000),
      },
    });

    // Add tags
    for (const tag of c.tags) {
      await prisma.contactTag.create({
        data: { contactId: contact.id, tag },
      });
    }

    // Add activities
    const activities = ACTIVITY_TEMPLATES[c.stage] || ACTIVITY_TEMPLATES.LEAD;
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      await prisma.activity.create({
        data: {
          contactId: contact.id,
          type: a.type,
          title: a.title,
          details: a.details || null,
          performedBy: a.type.startsWith("note") || a.type === "stage_changed" ? "admin" : "system",
          createdAt: new Date(createdAt.getTime() + i * 3600000), // 1 hour apart
        },
      });
    }

    console.log(`  ${c.firstName} ${c.lastName} (${c.stage}) - ${c.tags.join(", ")}`);
  }

  console.log(`\nDone! ${CONTACTS.length} contacts with activities and tags.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
