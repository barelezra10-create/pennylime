import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { HrClient, type ApplicantRow } from "./hr-client";

export const dynamic = "force-dynamic";

export default async function AdminHrPage() {
  const applicants = await prisma.jobApplicant.findMany({
    orderBy: { createdAt: "desc" },
  });

  const rows: ApplicantRow[] = applicants.map((a) => ({
    id: a.id,
    fullName: a.fullName,
    email: a.email,
    phone: a.phone,
    linkedin: a.linkedin,
    yearsExperience: a.yearsExperience,
    mcaExperience: a.mcaExperience,
    message: a.message,
    role: a.role,
    cvUrl: storage.getUrl(a.cvStoragePath),
    cvFileName: a.cvFileName,
    status: a.status,
    invitedAt: a.invitedAt ? a.invitedAt.toISOString() : null,
    proposedTimes: a.proposedTimes,
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-black">Hiring</h1>
        <p className="text-[13px] text-[#71717a] mt-0.5">
          Applications from the <a href="/hr" target="_blank" className="text-[#15803d] font-semibold underline">careers page</a>. Review CVs and invite candidates to interview.
        </p>
      </div>
      <HrClient rows={rows} />
    </div>
  );
}
