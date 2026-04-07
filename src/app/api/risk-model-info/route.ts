import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const model = await prisma.riskModel.findFirst({
    where: { isActive: true },
    select: {
      version: true,
      accuracy: true,
      precision: true,
      recall: true,
      trainingSize: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ model });
}
