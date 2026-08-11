import { notFound } from "next/navigation";
import { getApplicationById, getApplications } from "@/actions/applications";
import { getAchAuthorization } from "@/actions/ach-authorization";
import { DetailClient } from "./detail-client";
import type { ApplicationWithDocuments } from "@/types";
import { prisma } from "@/lib/db";
import { getTeamMembers } from "@/actions/team";
import { getLoanRules } from "@/lib/rules-engine";
import { buildCollectionsTimeline } from "@/lib/collections-ladder";

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
        smsOptIn: true,
        smsOptOutAt: true,
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
        smsOptIn: linkedContactRaw.smsOptIn,
        smsOptOutAt: linkedContactRaw.smsOptOutAt ? linkedContactRaw.smsOptOutAt.toISOString() : null,
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

  // Collections/dunning script for this account: what was sent + what's next.
  // Only build it for accounts that are on (or heading toward) the default flow.
  let collections = null;
  if (["LATE", "COLLECTIONS", "DEFAULTED"].includes(application.status)) {
    const [events, payments, rules] = await Promise.all([
      prisma.collectionEvent.findMany({
        where: { applicationId: id },
        orderBy: { createdAt: "asc" },
        select: { eventType: true, notes: true, createdAt: true },
      }),
      prisma.payment.findMany({
        where: { applicationId: id },
        select: { status: true, amount: true, lateFee: true, dueDate: true },
      }),
      getLoanRules(),
    ]);
    const t = buildCollectionsTimeline({
      status: application.status,
      payments: payments.map((p) => ({
        status: p.status,
        amount: Number(p.amount),
        lateFee: Number(p.lateFee),
        dueDate: p.dueDate,
      })),
      events,
      collectionsThresholdDays: rules.collections_threshold_days ? parseInt(rules.collections_threshold_days) : undefined,
      defaultThresholdDays: rules.default_threshold_days ? parseInt(rules.default_threshold_days) : undefined,
    });
    collections = {
      status: t.status,
      outstanding: t.outstanding,
      daysInCollections: t.daysInCollections,
      sent: t.sent.map((s) => ({ label: s.label, channel: s.channel, date: s.date ? s.date.toISOString() : null, note: s.note })),
      upcoming: t.upcoming.map((s) => ({ label: s.label, channel: s.channel, date: s.date ? s.date.toISOString() : null, note: s.note })),
    };
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
      collections={collections}
    />
  );
}
