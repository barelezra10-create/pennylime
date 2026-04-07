"use client";

import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";

interface TemplateItem {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  published: boolean;
  stepCount: number;
  updatedAt: string;
}

export function FormTemplatesClient({ templates }: { templates: TemplateItem[] }) {
  return (
    <div>
      <PageHeader
        title="Form Templates"
        description="Customize application forms for different campaigns"
        action={{ label: "New Template", href: "/admin/content/form-templates/new" }}
      />

      <div className="bg-white rounded-xl overflow-hidden border border-[#e4e4e7]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e4e4e7]">
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Name</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Steps</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Status</th>
              <th className="text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#a1a1aa] px-5 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-[#f4f4f5] last:border-0 hover:bg-[#f8f8f6] transition-colors">
                <td className="px-5 py-3.5">
                  <Link href={`/admin/content/form-templates/${t.id}`} className="text-[13px] font-medium text-black hover:text-[#15803d]">
                    {t.name}
                    {t.isDefault && <span className="ml-2 text-[10px] bg-[#f0f5f0] text-[#15803d] px-1.5 py-0.5 rounded-full">Default</span>}
                  </Link>
                  <p className="text-[11px] text-[#a1a1aa]">Slug: {t.slug}</p>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#71717a]">{t.stepCount} active steps</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold ${t.published ? "bg-[#f0f5f0] text-[#15803d]" : "bg-[#f4f4f5] text-[#71717a]"}`}>
                    {t.published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#a1a1aa]">{new Date(t.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {templates.length === 0 && (
          <div className="text-center py-12 text-[14px] text-[#71717a]">
            No form templates yet. Create one to customize your application flow.
          </div>
        )}
      </div>
    </div>
  );
}
