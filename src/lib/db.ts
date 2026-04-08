import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Check for Cloudflare D1 binding (available at runtime via Worker env)
  const d1Binding = (process.env as any).DB;

  if (d1Binding && typeof d1Binding === "object" && "prepare" in d1Binding) {
    // Cloudflare D1 runtime
    const { PrismaD1 } = require("@prisma/adapter-d1");
    const adapter = new PrismaD1(d1Binding);
    return new PrismaClient({ adapter });
  }

  // Local dev / build time: use better-sqlite3
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./dev.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
