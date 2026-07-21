import { getAdvances } from "@/actions/advances";
import { AdvancesClient } from "./advances-client";

export const dynamic = "force-dynamic";

export default async function AdvancesPage() {
  const { advances, summary } = await getAdvances();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">Advances</h1>
        <p className="text-sm text-[#a1a1aa] mt-0.5">Service and collect every live advance in one place</p>
      </div>
      <AdvancesClient advances={advances} summary={summary} />
    </div>
  );
}
