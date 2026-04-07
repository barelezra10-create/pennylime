import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const dbUrl = process.env.DATABASE_URL || "file:./dev.db";
const adapter = new PrismaBetterSqlite3({ url: dbUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.loanRule.upsert({
    where: { key: "loan_limit" },
    update: {},
    create: {
      key: "loan_limit",
      value: "10000",
      description: "Maximum loan amount in USD",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "income_multiplier_ratio" },
    update: {},
    create: {
      key: "income_multiplier_ratio",
      value: "2.0",
      description: "Required ratio of 3-month income to loan amount (income >= ratio * loanAmount)",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "max_file_size_mb" },
    update: {},
    create: {
      key: "max_file_size_mb",
      value: "10",
      description: "Maximum file upload size in MB",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "required_pay_stubs" },
    update: {},
    create: {
      key: "required_pay_stubs",
      value: "3",
      description: "Number of pay stubs required with application",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "min_loan" },
    update: {},
    create: {
      key: "min_loan",
      value: "100",
      description: "Minimum loan amount in dollars",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "min_bank_balance" },
    update: {},
    create: {
      key: "min_bank_balance",
      value: "200",
      description: "Minimum bank balance at time of application",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "max_loan_term_months" },
    update: {},
    create: {
      key: "max_loan_term_months",
      value: "18",
      description: "Maximum repayment period in months",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "min_interest_rate" },
    update: {},
    create: {
      key: "min_interest_rate",
      value: "30",
      description: "Floor interest rate (annual %)",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "late_fee_amount" },
    update: {},
    create: {
      key: "late_fee_amount",
      value: "25",
      description: "Flat late fee per missed payment in dollars",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "late_fee_grace_days" },
    update: {},
    create: {
      key: "late_fee_grace_days",
      value: "3",
      description: "Days after due date before late fee applies",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "collections_threshold_days" },
    update: {},
    create: {
      key: "collections_threshold_days",
      value: "30",
      description: "Days overdue before collections escalation",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "max_interest_rate" },
    update: {},
    create: {
      key: "max_interest_rate",
      value: "36",
      description: "Ceiling interest rate for highest-risk borrowers",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "retrain_threshold" },
    update: {},
    create: {
      key: "retrain_threshold",
      value: "50",
      description: "Number of completed loans before auto-retraining the risk model",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "retrain_min_data" },
    update: {},
    create: {
      key: "retrain_min_data",
      value: "30",
      description: "Minimum total training samples required to retrain the model",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "default_threshold_days" },
    update: {},
    create: {
      key: "default_threshold_days",
      value: "90",
      description: "Days in COLLECTIONS before escalating to DEFAULTED",
    },
  });

  await prisma.loanRule.upsert({
    where: { key: "completed_since_last_train" },
    update: {},
    create: {
      key: "completed_since_last_train",
      value: "0",
      description: "Counter of completed loans since last model training (internal)",
    },
  });

  const passwordHash = await bcrypt.hash("admin123", 12);
  await prisma.adminUser.upsert({
    where: { email: "admin@loanportal.com" },
    update: {},
    create: {
      email: "admin@loanportal.com",
      passwordHash,
      name: "Admin User",
    },
  });

  console.log("Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
