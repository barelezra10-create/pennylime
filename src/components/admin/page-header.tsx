import Link from "next/link";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-black">{title}</h1>
        {description && <p className="text-[14px] text-[#71717a] mt-1">{description}</p>}
      </div>
      {action && (
        action.href ? (
          <Link href={action.href} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors">
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2.5 rounded-xl hover:bg-[#166534] transition-colors">
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
