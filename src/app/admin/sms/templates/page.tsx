import { PageHeader } from "@/components/admin/page-header";
import { getSmsTemplates, createSmsTemplate, deleteSmsTemplate } from "@/actions/sms";

export const dynamic = "force-dynamic";

export default async function SmsTemplatesPage() {
  const templates = await getSmsTemplates();

  return (
    <div className="space-y-6">
      <PageHeader title="SMS Templates" description="Reusable text-message bodies. {{firstName}} and {{loanAmount}} placeholders are supported when sending." />

      <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">
        <h3 className="text-[14px] font-bold text-black mb-3">+ New template</h3>
        <form action={createSmsTemplate} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#71717a] mb-1">Name</span>
              <input
                name="name"
                required
                placeholder="e.g., Welcome SMS"
                className="text-[13px] border border-[#e4e4e7] rounded-lg px-3 py-2"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#71717a] mb-1">Description (optional)</span>
              <input
                name="description"
                placeholder="When to use this template"
                className="text-[13px] border border-[#e4e4e7] rounded-lg px-3 py-2"
              />
            </label>
          </div>
          <label className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#71717a] mb-1">Body</span>
            <textarea
              name="body"
              required
              rows={3}
              maxLength={1600}
              placeholder="Hey {{firstName}}, your application is approved. Reply YES to confirm."
              className="text-[13px] border border-[#e4e4e7] rounded-lg px-3 py-2 font-mono"
            />
            <span className="text-[10px] text-[#a1a1aa] mt-1">160 chars per segment. Reply STOP / HELP keywords are handled automatically.</span>
          </label>
          <button type="submit" className="bg-[#15803d] text-white text-[13px] font-semibold rounded-lg px-4 py-2 hover:bg-[#166534]">
            Create template
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-[#e4e4e7]">
        <div className="px-5 py-3 border-b border-[#e4e4e7]">
          <h3 className="text-[14px] font-bold text-black">{templates.length} templates</h3>
        </div>
        {templates.length === 0 ? (
          <p className="text-[13px] text-[#a1a1aa] p-8 text-center">No templates yet.</p>
        ) : (
          <ul className="divide-y divide-[#f4f4f5]">
            {templates.map((t) => (
              <li key={t.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-black">{t.name}</p>
                  {t.description && <p className="text-[11px] text-[#71717a]">{t.description}</p>}
                  <p className="text-[12px] text-black mt-2 font-mono whitespace-pre-wrap">{t.body}</p>
                  <p className="text-[10px] text-[#a1a1aa] mt-1.5">{t.body.length} chars · {Math.ceil(t.body.length / 160)} segment(s)</p>
                </div>
                <form action={async () => { "use server"; await deleteSmsTemplate(t.id); }}>
                  <button type="submit" className="text-[12px] text-[#dc2626] hover:underline">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
