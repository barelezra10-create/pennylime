import Link from "next/link";
import { getMainDashboard } from "@/actions/main-dashboard";

export const dynamic = "force-dynamic";

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa] mb-3">
      {children}
    </h2>
  );
}

type StatProps = {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "muted";
  href?: string;
};

function Stat({ label, value, sub, accent, href }: StatProps) {
  const valueColor =
    accent === "green"
      ? "text-[#15803d]"
      : accent === "red"
      ? "text-[#dc2626]"
      : accent === "muted"
      ? "text-[#71717a]"
      : "text-black";

  const inner = (
    <div className="bg-white rounded-xl border border-[#e4e4e7] p-4 hover:shadow-sm transition-shadow h-full">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[#a1a1aa] mb-2">
        {label}
      </p>
      <p className={`text-[24px] font-extrabold tracking-[-0.03em] leading-none ${valueColor}`}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-[#71717a] mt-1">{sub}</p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

const STAGE_ACCENT: Record<string, StatProps["accent"]> = {
  Active: "green",
  Paid: "green",
  Pending: undefined,
  Approved: undefined,
  Default: "red",
  Rejected: "muted",
};

export default async function AdminHomePage() {
  const { stages, money, support } = await getMainDashboard();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">Dashboard</h1>
        <p className="text-[13px] text-[#71717a] mt-0.5">Everything at a glance.</p>
      </div>

      {/* Pipeline */}
      <section>
        <SectionTitle>Pipeline</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {stages.map(({ stage, count, amount }) => (
            <Stat
              key={stage}
              label={stage}
              value={String(count)}
              sub={fmtMoney(amount)}
              accent={STAGE_ACCENT[stage]}
              href={`/admin/applications?stage=${stage}`}
            />
          ))}
        </div>
      </section>

      {/* Money */}
      <section>
        <SectionTitle>Money</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Money out" value={fmtMoney(money.moneyOut)} />
          <Stat label="Paid back" value={fmtMoney(money.paidBack)} accent="green" />
          <Stat label="Profit (realized)" value={fmtMoney(money.profit)} accent="green" />
          <Stat label="Potential profit" value={fmtMoney(money.potentialProfit)} />
          <Stat label="Outstanding" value={fmtMoney(money.totalOutstanding)} />
          <Stat label="Total ask" value={fmtMoney(money.totalAsk)} />
        </div>
      </section>

      {/* Support */}
      <section>
        <SectionTitle>Support</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="Tickets solved"
            value={String(support.ticketsSolved)}
            sub={`${support.ticketsOpen} open`}
            accent="green"
            href="/admin/tickets"
          />
          <Stat
            label="Chats active"
            value={String(support.chatsActive)}
            sub={`${support.chatsTotal} total`}
            href="/admin/chats"
          />
          <Stat
            label="Emails unread"
            value={String(support.emailsUnread)}
            sub={`${support.emailsInbound} total`}
            accent={support.emailsUnread > 0 ? "red" : undefined}
            href="/admin/inbox"
          />
          <Stat
            label="Tickets open"
            value={String(support.ticketsOpen)}
            accent={support.ticketsOpen > 0 ? "red" : "muted"}
            href="/admin/tickets"
          />
        </div>
      </section>
    </div>
  );
}
