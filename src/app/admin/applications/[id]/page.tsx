import { notFound } from "next/navigation";
import { getApplicationById } from "@/actions/applications";
import { DetailClient } from "./detail-client";
import type { ApplicationWithDocuments } from "@/types";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = await getApplicationById(id);

  if (!application) {
    notFound();
  }

  return (
    <DetailClient application={application as ApplicationWithDocuments} />
  );
}
