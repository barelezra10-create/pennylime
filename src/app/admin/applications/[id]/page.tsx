import { notFound } from "next/navigation";
import { getApplicationById } from "@/actions/applications";
import { getAchAuthorization } from "@/actions/ach-authorization";
import { DetailClient } from "./detail-client";
import type { ApplicationWithDocuments } from "@/types";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [application, achAuth] = await Promise.all([
    getApplicationById(id),
    getAchAuthorization(id),
  ]);

  if (!application) {
    notFound();
  }

  return (
    <DetailClient
      application={application as ApplicationWithDocuments}
      achAuth={achAuth}
    />
  );
}
