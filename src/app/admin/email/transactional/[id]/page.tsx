import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { getCatalogEntry } from "@/lib/notifications/transactional-catalog";

export default async function TransactionalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = getCatalogEntry(id);
  if (!entry) notFound();

  return (
    <div>
      <PageHeader
        title={entry.name}
        description={entry.description}
        action={{ label: "← Back to list", href: "/admin/email/transactional" }}
      />

      <div className="bg-white rounded-xl border border-[#e4e4e7] p-5 mb-6">
        <div className="grid grid-cols-2 gap-4 text-[13px]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa] mb-1">
              Trigger
            </p>
            <p className="font-mono text-[12px] text-black">{entry.trigger}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa] mb-1">
              Source
            </p>
            <p className="font-mono text-[12px] text-black">{entry.source}</p>
          </div>
        </div>
        <p className="text-[12px] text-[#71717a] mt-4">
          Previews below render with sample data. Edit the source files to change the copy.
        </p>
      </div>

      {entry.email && (
        <div className="mb-6">
          <h2 className="text-[14px] font-bold text-black mb-3 flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dbeafe] text-[#1e40af]">
              Email
            </span>
          </h2>
          <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e4e4e7] bg-[#f8f8f6]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa] mb-1">
                Subject
              </p>
              <p className="text-[14px] font-semibold text-black">{entry.email.subject}</p>
            </div>
            <iframe
              srcDoc={entry.email.html}
              sandbox=""
              className="w-full h-[600px] bg-white"
              title={`${entry.name} email preview`}
            />
          </div>
        </div>
      )}

      {entry.sms && (
        <div className="mb-6">
          <h2 className="text-[14px] font-bold text-black mb-3 flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#166534]">
              SMS
            </span>
          </h2>
          <div className="bg-white rounded-xl border border-[#e4e4e7] p-5">
            <div className="max-w-[340px] bg-[#e9e9eb] text-black rounded-2xl rounded-bl-sm px-4 py-3 text-[14px] leading-snug whitespace-pre-wrap">
              {entry.sms}
            </div>
            <div className="mt-3 flex gap-4 text-[11px] text-[#71717a]">
              <span>{entry.sms.length} chars</span>
              <span>{Math.ceil(entry.sms.length / 160)} segment(s)</span>
            </div>
          </div>
        </div>
      )}

      <p className="text-[12px] text-[#71717a]">
        <Link href="/admin/email/transactional" className="text-[#15803d] hover:underline">
          ← Back to all transactional notifications
        </Link>
      </p>
    </div>
  );
}
