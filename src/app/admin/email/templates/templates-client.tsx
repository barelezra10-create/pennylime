"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";

interface Template {
  id: string;
  name: string;
  subject: string;
  category: string | null;
  updatedAt: Date;
}

export function TemplatesClient({ templates }: { templates: Template[] }) {
  const router = useRouter();

  return (
    <div>
      <PageHeader
        title="Email Templates"
        description="Reusable email templates for campaigns and sequences"
        action={{ label: "+ New Template", href: "/admin/email/templates/new" }}
      />

      <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
        {templates.length === 0 ? (
          <div className="text-center py-16 text-[#a1a1aa]">
            <p className="text-[15px] font-medium mb-1">No templates yet</p>
            <p className="text-[13px]">Create reusable email templates to speed up your campaigns.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e4e4e7]">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Category</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Updated</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-[#e4e4e7] last:border-0 hover:bg-[#f8f8f6] cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/email/templates/${t.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="text-[13px] font-semibold text-black">{t.name}</p>
                    <p className="text-[12px] text-[#71717a] truncate max-w-[300px]">{t.subject}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f4f4f5] text-[#71717a] capitalize">
                      {t.category ?? "general"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#71717a]">
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
