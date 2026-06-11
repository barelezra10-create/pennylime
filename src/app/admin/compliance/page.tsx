import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import Link from "next/link";
import { CFDL_STATES } from "@/lib/compliance/cfdl/state-requirements";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function CompliancePage() {
  const [
    cfdlDisclosures,
    sanctionsScreenings,
    cfdlByState,
    sanctionsByStatus,
    cfdlStateMerchantCounts,
  ] = await Promise.all([
    prisma.cfdlDisclosure.findMany({
      orderBy: { signedAt: "desc" },
      take: 50,
    }),
    prisma.sanctionsScreening.findMany({
      orderBy: { screenedAt: "desc" },
      take: 100,
    }),
    prisma.cfdlDisclosure.groupBy({
      by: ["state"],
      _count: { id: true },
    }),
    prisma.sanctionsScreening.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    // Count of applications in each CFDL state — used to identify gaps
    // (applications in NY without a signed disclosure, etc).
    prisma.application.groupBy({
      by: ["addressState"],
      where: { addressState: { in: CFDL_STATES } },
      _count: { id: true },
    }),
  ]);

  // Cross-reference: which CFDL-state apps are missing a disclosure?
  const allCfdlApps = await prisma.application.findMany({
    where: {
      addressState: { in: CFDL_STATES },
      offerStatus: { in: ["ACCEPTED", "OFFERED"] },
    },
    select: {
      id: true,
      applicationCode: true,
      firstName: true,
      lastName: true,
      addressState: true,
      offerStatus: true,
      status: true,
    },
  });
  const disclosureByApp = new Map(cfdlDisclosures.map((d) => [d.applicationId, d]));
  const cfdlGaps = allCfdlApps.filter((a) => !disclosureByApp.has(a.id));

  const sanctionsStatusCounts = Object.fromEntries(
    sanctionsByStatus.map((s) => [s.status, s._count.id]),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Compliance" description="CFDL state disclosures and OFAC / PEP sanctions screening" />
        <div className="flex items-center gap-2">
          <a
            href="/api/admin/legal/rpsa-blank"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#15803d] bg-white text-[#15803d] hover:bg-[#f0fdf4] text-[12px] font-semibold px-3 py-1.5 transition-colors"
            title="Download the unfilled Receivables Purchase Agreement template as a PDF"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Blank RPSA (PDF)
          </a>
          <a
            href="/api/admin/legal/rpsa-blank?format=md"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-white text-[#52525b] hover:text-[#15803d] hover:border-[#15803d] text-[12px] font-semibold px-3 py-1.5 transition-colors"
            title="Download the raw markdown source of the agreement template"
          >
            .md
          </a>
        </div>
      </div>

      {/* CFDL Section */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[15px] font-bold tracking-tight">CFDL State Disclosures</h2>
          <span className="text-[12px] text-[#71717a]">8 covered states: NY · CA · UT · VA · GA · CT · MO · KS</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Kpi label="Signed disclosures" value={cfdlDisclosures.length.toString()} sub="total on file" />
          <Kpi
            label="CFDL-state applications"
            value={cfdlStateMerchantCounts.reduce((s, c) => s + c._count.id, 0).toString()}
            sub="merchants in covered states"
          />
          <Kpi
            label="Gap — missing disclosure"
            value={cfdlGaps.length.toString()}
            sub="offered/accepted, no sign"
            accent={cfdlGaps.length > 0 ? "red" : "ok"}
          />
          <Kpi
            label="Most active state"
            value={cfdlByState.sort((a, b) => b._count.id - a._count.id)[0]?.state || "—"}
            sub="by disclosure count"
          />
        </div>

        {cfdlGaps.length > 0 ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="font-bold text-[13px] text-red-900">
              {cfdlGaps.length} CFDL-state application{cfdlGaps.length === 1 ? "" : "s"} without a signed disclosure
            </div>
            <ul className="mt-2 space-y-1 text-[12px]">
              {cfdlGaps.slice(0, 10).map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/applications/${a.id}`} className="text-red-700 font-mono hover:underline">
                    {a.applicationCode}
                  </Link>{" "}
                  <span className="text-red-800">
                    {a.firstName} {a.lastName} ({a.addressState}) — offer {a.offerStatus}
                  </span>
                </li>
              ))}
              {cfdlGaps.length > 10 ? <li className="text-red-700">…and {cfdlGaps.length - 10} more</li> : null}
            </ul>
          </div>
        ) : null}

        <div className="bg-white border border-[#e4e4e7] rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafafa]">
              <tr>
                <Th>State</Th>
                <Th>Signed</Th>
                <Th>Merchant</Th>
                <Th align="right">APR</Th>
                <Th align="right">Disbursed</Th>
                <Th>Signature evidence</Th>
                <Th>PDF</Th>
              </tr>
            </thead>
            <tbody>
              {cfdlDisclosures.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[#a1a1aa]">
                    No CFDL disclosures signed yet.
                  </td>
                </tr>
              ) : (
                cfdlDisclosures.map((d) => (
                  <tr key={d.id} className="border-t border-[#f4f4f5] hover:bg-[#fafafa]">
                    <Td>
                      <span className="inline-flex items-center rounded-full bg-[#f0fdf4] text-[#15803d] text-[11px] font-bold px-2 py-0.5">
                        {d.state}
                      </span>
                    </Td>
                    <Td className="font-mono text-[11px]">{fmtDate(d.signedAt)}</Td>
                    <Td>{d.signedName}</Td>
                    <Td align="right" className="tabular-nums font-semibold text-[#15803d]">
                      {d.aprPercent.toFixed(2)}%
                    </Td>
                    <Td align="right" className="tabular-nums">
                      ${Number(d.disbursedAmount).toLocaleString()}
                    </Td>
                    <Td className="text-[11px] text-[#71717a]">
                      {d.scrolledToBottom ? "✓ Scrolled" : "✗ Scroll"} · IP {d.signedIp?.slice(0, 15) || "—"}
                    </Td>
                    <Td>
                      {d.documentId ? (
                        <Link
                          href={`/admin/applications/${d.applicationId}#documents`}
                          className="text-[12px] text-[#15803d] hover:underline"
                        >
                          Open
                        </Link>
                      ) : (
                        <span className="text-[#a1a1aa] text-[12px]">—</span>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sanctions Section */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-[15px] font-bold tracking-tight">OFAC / PEP Sanctions Screening</h2>
          <span className="text-[12px] text-[#71717a]">Powered by OpenSanctions — daily-updated SDN, EU, UN, UK + PEP lists</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Kpi label="Total screened" value={sanctionsScreenings.length.toString()} sub="applicants" />
          <Kpi label="Cleared" value={(sanctionsStatusCounts.CLEAR || 0).toString()} sub="no hits" accent="ok" />
          <Kpi
            label="Review queue"
            value={(sanctionsStatusCounts.REVIEW || 0).toString()}
            sub="partial matches"
            accent={(sanctionsStatusCounts.REVIEW || 0) > 0 ? "warn" : undefined}
          />
          <Kpi
            label="High-confidence match"
            value={(sanctionsStatusCounts.MATCH || 0).toString()}
            sub="do not fund without review"
            accent={(sanctionsStatusCounts.MATCH || 0) > 0 ? "red" : undefined}
          />
        </div>

        <div className="bg-white border border-[#e4e4e7] rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[#fafafa]">
              <tr>
                <Th>Status</Th>
                <Th>Screened</Th>
                <Th>Name</Th>
                <Th>DOB</Th>
                <Th align="right">Hits</Th>
                <Th>Reviewed by</Th>
                <Th>App</Th>
              </tr>
            </thead>
            <tbody>
              {sanctionsScreenings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[#a1a1aa]">
                    No screenings on file yet. Will populate on next application submit.
                  </td>
                </tr>
              ) : (
                sanctionsScreenings.map((s) => (
                  <tr key={s.id} className="border-t border-[#f4f4f5] hover:bg-[#fafafa]">
                    <Td>
                      <StatusPill status={s.status} />
                    </Td>
                    <Td className="font-mono text-[11px]">{fmtDate(s.screenedAt)}</Td>
                    <Td>{s.fullName}</Td>
                    <Td className="text-[11px] text-[#71717a]">{s.dateOfBirth || "—"}</Td>
                    <Td align="right" className="tabular-nums font-semibold">
                      {s.hitCount > 0 ? s.hitCount : "—"}
                    </Td>
                    <Td className="text-[11px] text-[#71717a]">
                      {s.reviewedBy ? `${s.reviewedBy} · ${s.reviewedAt ? fmtDate(s.reviewedAt) : ""}` : "—"}
                    </Td>
                    <Td>
                      <Link
                        href={`/admin/applications/${s.applicationId}`}
                        className="text-[12px] text-[#15803d] hover:underline"
                      >
                        Open
                      </Link>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "ok" | "warn" | "red";
}) {
  const bg =
    accent === "red"
      ? "bg-red-50 border-red-200"
      : accent === "warn"
        ? "bg-amber-50 border-amber-200"
        : accent === "ok"
          ? "bg-[#f0fdf4] border-[#dcfce7]"
          : "bg-white border-[#e4e4e7]";
  const vc =
    accent === "red"
      ? "text-red-900"
      : accent === "warn"
        ? "text-amber-900"
        : accent === "ok"
          ? "text-[#15803d]"
          : "text-[#0a0a0a]";
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#71717a]">{label}</div>
      <div className={`mt-1.5 text-[22px] font-bold tabular-nums ${vc}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-[#71717a]">{sub}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    CLEAR: { bg: "bg-[#f0fdf4]", text: "text-[#15803d]" },
    REVIEW: { bg: "bg-amber-50", text: "text-amber-800" },
    MATCH: { bg: "bg-red-50", text: "text-red-800" },
  };
  const c = map[status] || { bg: "bg-stone-100", text: "text-[#52525b]" };
  return (
    <span className={`inline-flex items-center rounded-full text-[11px] font-bold px-2 py-0.5 ${c.bg} ${c.text}`}>
      {status}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-5 py-3 text-[10px] uppercase tracking-[0.06em] font-semibold text-[#a1a1aa] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`px-5 py-3 text-[13px] text-[#27272a] ${align === "right" ? "text-right" : "text-left"} ${className || ""}`}
    >
      {children}
    </td>
  );
}
