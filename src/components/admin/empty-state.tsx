import Link from "next/link";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16 px-6">
      {icon && <div className="mx-auto w-12 h-12 rounded-xl bg-[#f4f4f5] flex items-center justify-center text-[#a1a1aa] mb-4">{icon}</div>}
      <h3 className="text-[16px] font-bold text-black mb-1">{title}</h3>
      <p className="text-[14px] text-[#71717a] max-w-sm mx-auto">{description}</p>
      {action && (
        <Link href={action.href} className="inline-block mt-4 bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors">
          {action.label}
        </Link>
      )}
    </div>
  );
}
