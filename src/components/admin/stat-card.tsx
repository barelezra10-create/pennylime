interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: "green" | "blue" | "amber" | "red" | "gray";
}

const COLOR_MAP = {
  green: { bg: "bg-[#f0fdf4]", icon: "bg-[#15803d]/10 text-[#15803d]" },
  blue: { bg: "bg-[#eff6ff]", icon: "bg-[#2563eb]/10 text-[#2563eb]" },
  amber: { bg: "bg-[#fffbeb]", icon: "bg-[#b45309]/10 text-[#b45309]" },
  red: { bg: "bg-[#fef2f2]", icon: "bg-[#dc2626]/10 text-[#dc2626]" },
  gray: { bg: "bg-white", icon: "bg-[#f4f4f5] text-[#71717a]" },
};

export function StatCard({ label, value, icon, color = "gray" }: StatCardProps) {
  const c = COLOR_MAP[color];
  return (
    <div className={`${c.bg} rounded-xl p-5 border border-transparent`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa]">{label}</p>
        {icon && <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.icon}`}>{icon}</div>}
      </div>
      <p className="text-[28px] font-extrabold tracking-[-0.03em] text-black">{value}</p>
    </div>
  );
}
