import { prisma } from "@/lib/db";

export type TrackingConfigShape = Awaited<ReturnType<typeof getTrackingConfig>>;

export async function getTrackingConfig() {
  const existing = await prisma.trackingConfig.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return prisma.trackingConfig.create({
    data: { id: "singleton" },
  });
}

export async function updateTrackingConfig(data: Record<string, unknown>) {
  return prisma.trackingConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}
