export const PIPELINE_STAGES = [
  "LEAD",
  "CONTACTED",
  "APPLICANT",
  "APPROVED",
  "REJECTED",
  "FUNDED",
  "REPAYING",
  "PAID_OFF",
  "DEFAULTED",
  "LOST",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  LEAD: { bg: "bg-[#f4f4f5]", text: "text-[#71717a]" },
  CONTACTED: { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  APPLICANT: { bg: "bg-[#fef9ec]", text: "text-[#b45309]" },
  APPROVED: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]" },
  REJECTED: { bg: "bg-[#fef2f2]", text: "text-[#dc2626]" },
  FUNDED: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]" },
  REPAYING: { bg: "bg-[#eff6ff]", text: "text-[#2563eb]" },
  PAID_OFF: { bg: "bg-[#f0fdf4]", text: "text-[#166534]" },
  DEFAULTED: { bg: "bg-[#fef2f2]", text: "text-[#dc2626]" },
  LOST: { bg: "bg-[#f4f4f5]", text: "text-[#71717a]" },
};

export const KANBAN_STAGES: PipelineStage[] = [
  "LEAD",
  "CONTACTED",
  "APPLICANT",
  "APPROVED",
  "FUNDED",
  "REPAYING",
];

export function parseUtmParams(searchParams: URLSearchParams) {
  return {
    utmSource: searchParams.get("utm_source") || undefined,
    utmCampaign: searchParams.get("utm_campaign") || undefined,
    utmMedium: searchParams.get("utm_medium") || undefined,
  };
}
