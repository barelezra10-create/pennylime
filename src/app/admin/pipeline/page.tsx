import { getContactsByStage } from "@/actions/contacts";
import { getTeamMembers } from "@/actions/team";
import { PipelineClient } from "./pipeline-client";

export default async function PipelinePage() {
  const [grouped, team] = await Promise.all([getContactsByStage(), getTeamMembers()]);

  // Serialize dates into plain ContactCard objects
  const serialized: Record<
    string,
    {
      id: string;
      firstName: string;
      lastName: string | null;
      email: string;
      phone: string | null;
      stage: string;
      source: string | null;
      lastAppStep: number | null;
      updatedAt: string;
      assignedRep: { id: string; name: string } | null;
      tags: string[];
    }[]
  > = {};

  for (const [stage, contacts] of Object.entries(grouped)) {
    serialized[stage] = contacts.map((c) => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      stage: c.stage,
      source: c.source,
      lastAppStep: c.lastAppStep,
      updatedAt: c.updatedAt.toISOString(),
      assignedRep: c.assignedRep,
      tags: c.tags.map((t) => t.tag),
    }));
  }

  return <PipelineClient grouped={serialized} team={team} />;
}
