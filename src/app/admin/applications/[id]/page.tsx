import { notFound } from "next/navigation";
import { getApplicationById, getApplications } from "@/actions/applications";
import { getAchAuthorization } from "@/actions/ach-authorization";
import { DetailClient } from "./detail-client";
import type { ApplicationWithDocuments } from "@/types";
import { prisma } from "@/lib/db";
import { getTeamMembers } from "@/actions/team";

const TAB_STATUS: Record<string, string | null> = {
  All: null,
  Pending: "PENDING",
  Approved: "APPROVED",
  Funded: "FUNDED",
  Active: "ACTIVE",
  Late: "LATE",
  Collections: "COLLECTIONS",
  Defaulted: "DEFAULTED",
  "Paid Off": "PAID_OFF",
};

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const [application, achAuth, all, linkedContactRaw] = await Promise.all([
    getApplicationById(id),
    getAchAuthorization(id),
    getApplications() as Promise<ApplicationWithDocuments[]>,
    prisma.contact.findUnique({
      where: { applicationId: id },
      select: {
        id: true,
        email: true,
        phone: true,
        stage: true,
        assignedRepId: true,
        assignedRep: { select: { name: true } },
        tags: { select: { tag: true } },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true,
            type: true,
            title: true,
            details: true,
            performedBy: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  const team = linkedContactRaw ? await getTeamMembers() : [];

  const crm = linkedContactRaw
    ? {
        contactId: linkedContactRaw.id,
        email: linkedContactRaw.email,
        phone: linkedContactRaw.phone,
        stage: linkedContactRaw.stage,
        assignedRepId: linkedContactRaw.assignedRepId,
        assignedRepName: linkedContactRaw.assignedRep?.name ?? null,
        tags: linkedContactRaw.tags.map((t) => t.tag),
        activities: linkedContactRaw.activities.map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          details: a.details,
          performedBy: a.performedBy,
          createdAt: a.createdAt.toISOString(),
        })),
        team: team.map((m) => ({ id: m.id, name: m.name })),
      }
    : null;

  if (!application) {
    notFound();
  }

  // Compute prev/next within the same filtered list the user came from, so
  // they can step through applications without bouncing back to the list.
  const statusFilter = from ? TAB_STATUS[from] : null;
  const siblings =
    from && statusFilter
      ? all.filter((a) => a.status === statusFilter)
      : all;
  const idx = siblings.findIndex((a) => a.id === id);
  const prevId = idx > 0 ? siblings[idx - 1].id : null;
  const nextId = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1].id : null;

  return (
    <DetailClient
      application={application as ApplicationWithDocuments}
      achAuth={achAuth}
      fromTab={from ?? null}
      prevId={prevId}
      nextId={nextId}
      position={idx >= 0 ? { index: idx + 1, total: siblings.length } : null}
      crm={crm}
    />
  );
}
