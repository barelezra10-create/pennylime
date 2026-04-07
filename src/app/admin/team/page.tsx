import { getTeamMembers } from "@/actions/team";
import { TeamClient } from "./team-client";

export default async function TeamPage() {
  const members = await getTeamMembers();
  return <TeamClient members={members} />;
}
