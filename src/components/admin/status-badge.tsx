import type { ReactNode } from "react";

type Style = { bg: string; text: string; dot: string; label: string };

const GREEN: Omit<Style, "label"> = { bg: "bg-[#f0f5f0]", text: "text-[#15803d]", dot: "bg-[#15803d]" };
const RED:   Omit<Style, "label"> = { bg: "bg-[#fff1f2]", text: "text-[#dc2626]", dot: "bg-[#dc2626]" };
const AMBER: Omit<Style, "label"> = { bg: "bg-[#fef9ec]", text: "text-[#b45309]", dot: "bg-[#b45309]" };
const BLUE:  Omit<Style, "label"> = { bg: "bg-[#eef4ff]", text: "text-[#2563eb]", dot: "bg-[#2563eb]" };
const GRAY:  Omit<Style, "label"> = { bg: "bg-stone-100", text: "text-[#52525b]", dot: "bg-[#a1a1aa]" };

function resolve(status: string, offerStatus?: string | null): Style {
  if (status === "APPROVED") {
    switch (offerStatus) {
      case "OFFERED":  return { ...BLUE,  label: "Offer Sent" };
      case "ACCEPTED": return { ...GREEN, label: "Offer Accepted" };
      case "DECLINED": return { ...RED,   label: "Offer Declined" };
      default:         return { ...GREEN, label: "Approved" };
    }
  }
  const map: Record<string, Style> = {
    REJECTED:    { ...RED,   label: "Rejected" },
    PENDING:     { ...AMBER, label: "Pending" },
    ACTIVE:      { ...BLUE,  label: "Active" },
    // FUNDED = ACH credit went out. Distinct from ACTIVE (which means
    // repayments have started). Both are post-disbursement.
    FUNDED:      { ...GREEN, label: "Funded" },
    REPAYING:    { ...BLUE,  label: "Repaying" },
    LATE:        { ...RED,   label: "Late" },
    COLLECTIONS: { ...RED,   label: "Collections" },
    DEFAULTED:   { ...RED,   label: "Defaulted" },
    PAID_OFF:    { ...GREEN, label: "Paid Off" },
  };
  return map[status] ?? { ...GRAY, label: status || "Unknown" };
}

export function StatusBadge({
  status,
  offerStatus,
  size = "md",
}: {
  status: string;
  offerStatus?: string | null;
  size?: "sm" | "md";
}): ReactNode {
  const c = resolve(status, offerStatus);
  const sizing =
    size === "sm"
      ? "px-2 py-0.5 text-[10px] gap-1"
      : "px-2.5 py-1 text-xs gap-1.5";
  const dot = size === "sm" ? "w-1 h-1" : "w-1.5 h-1.5";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sizing} ${c.bg} ${c.text}`}>
      <span className={`rounded-full ${dot} ${c.dot}`} />
      {c.label}
    </span>
  );
}
