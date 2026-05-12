import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL environment variable is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg(DATABASE_URL) });

type SocialPlatform = "instagram" | "facebook" | "linkedin" | "tiktok";

const ACCOUNTS: Array<{ platform: SocialPlatform; handle: string }> = [
  { platform: "instagram", handle: "@pennylime" },
  { platform: "facebook", handle: "@pennylime" },
  { platform: "linkedin", handle: "@pennylime" },
  { platform: "tiktok", handle: "@pennylime" },
];

async function main() {
  for (const a of ACCOUNTS) {
    await prisma.socialAccount.upsert({
      where: { platform_handle: { platform: a.platform, handle: a.handle } },
      create: { platform: a.platform, handle: a.handle, accessToken: "" },
      update: {},
    });
    console.log(`✓ ${a.platform} ${a.handle}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
