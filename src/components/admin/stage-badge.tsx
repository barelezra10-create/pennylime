import { STAGE_COLORS } from "@/lib/contact-helpers";

export function StageBadge({ stage }: { stage: string }) {
  const colors = STAGE_COLORS[stage] || STAGE_COLORS.LEAD;
  return (
    <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold ${colors.bg} ${colors.text}`}>
      {stage.replace("_", " ")}
    </span>
  );
}
