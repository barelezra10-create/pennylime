import { getApplications } from "@/actions/applications";
import { ApplicationsClient } from "./applications-client";
import type { ApplicationWithDocuments } from "@/types";

export default async function ApplicationsPage() {
  const applications = (await getApplications()) as ApplicationWithDocuments[];

  return <ApplicationsClient applications={applications} />;
}
