import { notFound } from "next/navigation";
import { getApplicationById, getApplications } from "@/actions/applications";
import { getAchAuthorization } from "@/actions/ach-authorization";
import { DetailClient } from "./detail-client";
import type { ApplicationWithDocuments } from "@/types";

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
  const [application, achAuth, all] = await Promise.all([
    getApplicationById(id),
    getAchAuthorization(id),
    getApplications() as Promise<ApplicationWithDocuments[]>,
  ]);

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
    />
  );
}
