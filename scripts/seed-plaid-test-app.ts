import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const PLAID_TEST_APP_ID = "plaid-smoke-test";

async function main() {
  await prisma.application.upsert({
    where: { id: PLAID_TEST_APP_ID },
    update: {
      // Reset Plaid + downstream fields on every deploy so smoke test starts clean
      plaidAccessToken: null,
      plaidAccountId: null,
      plaidItemId: null,
      plaidLinkStale: false,
      monthlyIncome: null,
      bankBalance: null,
      increaseTransferId: null,
      increaseTransferStatus: null,
      increaseDisburseError: null,
    },
    create: {
      id: PLAID_TEST_APP_ID,
      applicationCode: "PLAID-TEST",
      firstName: "Plaid",
      lastName: "Sandbox",
      email: "plaid-smoke-test@pennylime.com",
      phone: "(555) 555-0100",
      loanAmount: 1000,
      loanTermMonths: 6,
      platform: "Uber",
      status: "PENDING",
    },
  });
  console.log(`Seeded Plaid smoke-test application: ${PLAID_TEST_APP_ID}`);
}

main()
  .catch((err) => {
    console.error("Failed to seed Plaid test app:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
