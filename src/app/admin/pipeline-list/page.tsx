import { getPipelineRecords } from "@/actions/pipeline-records";
import { PipelineListClient } from "./pipeline-list-client";

export const dynamic = "force-dynamic";

export default async function PipelineListPage() {
  const records = await getPipelineRecords();
  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <div className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[#0a0a0a]">Pipeline</h1>
        <p className="text-[13px] text-[#71717a] mt-0.5">
          Every person across all lifecycle stages, in one view.
        </p>
      </div>
      <PipelineListClient records={records} />
    </div>
  );
}
