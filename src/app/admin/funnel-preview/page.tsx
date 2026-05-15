export const dynamic = "force-dynamic";

export default function FunnelPreviewPage() {
  return (
    <div className="-m-6 lg:-m-8 h-[calc(100vh-120px)]">
      <div className="bg-[#f4f4f5] border-b border-[#e4e4e7] px-4 py-2 flex items-center gap-3">
        <span className="text-[12px] font-semibold text-[#52525b]">Funnel preview</span>
        <span className="text-[11px] text-[#71717a]">
          SMS verification and Plaid Link bypassed. Use the &quot;Use mock bank&quot; button on
          the bank-link step. Submissions still write to the live DB.
        </span>
        <a
          href="/apply?preview=1"
          target="_blank"
          rel="noopener"
          className="ml-auto text-[12px] font-semibold text-[#15803d] hover:underline"
        >
          Open in new tab ↗
        </a>
      </div>
      <iframe
        src="/apply?preview=1"
        className="w-full h-full bg-white"
        title="Funnel preview"
      />
    </div>
  );
}
