import { getAdvances } from "@/actions/advances";
import { AdvancesClient } from "../advances/advances-client";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const { advances, summary } = await getAdvances();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-black">Customers</h1>
        <p className="text-sm text-[#71717a] mt-1">
          Manage your advances - payments, status, and contact, all in one place.
        </p>
      </div>
      <AdvancesClient advances={advances} summary={summary} />
    </div>
  );
}
