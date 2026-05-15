import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { TRANSACTIONAL_CATALOG } from "@/lib/notifications/transactional-catalog";
import { TestSendForm } from "./test-send-form";

export default function TransactionalPage() {
  return (
    <div>
      <PageHeader
        title="Transactional Notifications"
        description="Code-defined emails + SMS that fire on application and payment events. Edit in src/lib/emails/ or src/lib/sms/transactional.ts."
      />

      <TestSendForm />

      <div className="bg-white rounded-xl border border-[#e4e4e7] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e4e4e7]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Notification</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Channels</th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#a1a1aa]">Trigger</th>
            </tr>
          </thead>
          <tbody>
            {TRANSACTIONAL_CATALOG.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-[#e4e4e7] last:border-0 hover:bg-[#f8f8f6] transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/email/transactional/${entry.id}`}
                    className="block"
                  >
                    <p className="text-[13px] font-semibold text-black">{entry.name}</p>
                    <p className="text-[12px] text-[#71717a] truncate max-w-[420px]">
                      {entry.description}
                    </p>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    {entry.channels.includes("email") && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dbeafe] text-[#1e40af]">
                        Email
                      </span>
                    )}
                    {entry.channels.includes("sms") && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#166534]">
                        SMS
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-[12px] text-[#71717a] font-mono">
                  {entry.trigger}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
