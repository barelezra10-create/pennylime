import { getPipelineRecords } from "@/actions/pipeline-records";
import { PipelineListClient } from "../pipeline-list/pipeline-list-client";

export const dynamic = "force-dynamic";

// The Applications view IS the unified CRM pipeline: every person across the
// whole lifecycle (lead through paid off), filterable by stage, each row
// opening their unified record. "Applications" and "Advances" are just stage
// filters on this one list.
export default async function ApplicationsPage() {
  const records = await getPipelineRecords();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">Pipeline</h1>
        <p className="text-sm text-[#a1a1aa] mt-0.5">Everyone in one place, by stage. Click a person to manage them.</p>
      </div>
      <PipelineListClient records={records} />
    </div>
  );
}
