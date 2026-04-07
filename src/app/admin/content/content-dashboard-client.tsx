"use client";

import Link from "next/link";

const contentTypes = [
  { label: "Articles", href: "/admin/content/articles", key: "articles" as const },
  { label: "Platform Pages", href: "/admin/content/platforms", key: "platforms" as const },
  { label: "State Pages", href: "/admin/content/states", key: "states" as const },
  { label: "Tool Pages", href: "/admin/content/tools", key: "tools" as const },
  { label: "Comparisons", href: "/admin/content/comparisons", key: "comparisons" as const },
  { label: "Landing Pages", href: "/admin/content/landing-pages", key: "landingPages" as const },
  { label: "Form Templates", href: "/admin/content/form-templates", key: "formTemplates" as const },
];

const quickLinks = [
  { label: "Categories & Tags", href: "/admin/content/categories" },
  { label: "Image Library", href: "/admin/content/images" },
];

export function ContentDashboardClient({
  counts,
}: {
  counts: {
    articles: number;
    platforms: number;
    states: number;
    tools: number;
    comparisons: number;
    landingPages: number;
    formTemplates: number;
    published: number;
  };
}) {
  const total = counts.articles + counts.platforms + counts.states + counts.tools + counts.comparisons + counts.landingPages + counts.formTemplates;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">Content</h1>
          <p className="text-[13px] text-[#71717a] mt-1">{total} total pages · {counts.published} published</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {contentTypes.map((type) => (
          <Link
            key={type.key}
            href={type.href}
            className="bg-white rounded-[10px] p-4 hover:shadow-sm transition-shadow"
          >
            <p className="text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1">{type.label}</p>
            <p className="text-[22px] font-extrabold tracking-[-0.02em] text-black">{counts[type.key]}</p>
          </Link>
        ))}
      </div>

      <div className="flex gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-[13px] font-medium text-[#15803d] hover:underline"
          >
            {link.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}
