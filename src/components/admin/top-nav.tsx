"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getInboxBadges, type InboxBadges } from "@/actions/inbox-badges";

type SubItem = { href: string; label: string };

type TopTab = {
  id: string;
  label: string;
  icon: string;
  // pathname prefixes that activate this tab
  prefixes: string[];
  // landing URL when the tab is clicked
  href: string;
  subnav: SubItem[];
};

const TABS: TopTab[] = [
  {
    id: "loans",
    label: "Loan Portal",
    icon: "$",
    prefixes: ["/admin/dashboard", "/admin/applications", "/admin/payments", "/admin/audit", "/admin/settings", "/admin/plaid-test", "/admin/increase-test", "/admin/funnel-preview"],
    href: "/admin/dashboard",
    subnav: [
      { href: "/admin/dashboard", label: "Overview" },
      { href: "/admin/applications", label: "Applications" },
      { href: "/admin/payments", label: "Payments" },
      { href: "/admin/audit", label: "Audit log" },
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/settings/notifications", label: "Notifications" },
      { href: "/admin/funnel-preview", label: "Funnel preview" },
      { href: "/admin/plaid-test", label: "Plaid test" },
      { href: "/admin/increase-test", label: "Increase test" },
    ],
  },
  {
    id: "marketing",
    label: "Email & SMS",
    icon: "✉",
    prefixes: ["/admin/email", "/admin/sms", "/admin/social"],
    href: "/admin/email",
    subnav: [
      { href: "/admin/email", label: "Overview" },
      { href: "/admin/email/transactional", label: "Transactional" },
      { href: "/admin/email/campaigns", label: "Email campaigns" },
      { href: "/admin/email/sequences", label: "Sequences" },
      { href: "/admin/email/templates", label: "Email templates" },
      { href: "/admin/sms/campaigns", label: "SMS campaigns" },
      { href: "/admin/sms/sequences", label: "SMS sequences" },
      { href: "/admin/sms/templates", label: "SMS templates" },
      { href: "/admin/social", label: "Social" },
      { href: "/admin/social/calendar/instagram", label: "Social calendar" },
      { href: "/admin/social/schedule", label: "Social schedule" },
    ],
  },
  {
    id: "media",
    label: "Paid Media",
    icon: "↗",
    prefixes: ["/admin/settings/tracking", "/admin/media"],
    href: "/admin/settings/tracking",
    subnav: [
      { href: "/admin/settings/tracking", label: "Tracking & pixels" },
      { href: "/admin/dashboard?focus=media", label: "Spend & ROI" },
    ],
  },
  {
    id: "content",
    label: "Landing Pages & Content",
    icon: "▢",
    prefixes: ["/admin/content"],
    href: "/admin/content",
    subnav: [
      { href: "/admin/content", label: "Overview" },
      { href: "/admin/content/landing-pages", label: "Landing pages" },
      { href: "/admin/content/articles", label: "Articles" },
      { href: "/admin/content/platforms", label: "Platforms" },
      { href: "/admin/content/states", label: "States" },
      { href: "/admin/content/tools", label: "Tools" },
      { href: "/admin/content/comparisons", label: "Comparisons" },
      { href: "/admin/content/form-templates", label: "Form templates" },
      { href: "/admin/content/categories", label: "Categories" },
      { href: "/admin/content/images", label: "Images" },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    icon: "◉",
    prefixes: ["/admin/contacts", "/admin/pipeline", "/admin/abandoned", "/admin/team"],
    href: "/admin/contacts",
    subnav: [
      { href: "/admin/contacts", label: "Contacts" },
      { href: "/admin/pipeline", label: "Pipeline" },
      { href: "/admin/abandoned", label: "Abandoned" },
      { href: "/admin/team", label: "Team" },
    ],
  },
  {
    id: "support",
    label: "AI Support",
    icon: "✦",
    prefixes: ["/admin/agent", "/admin/tickets"],
    href: "/admin/agent/sessions",
    subnav: [
      { href: "/admin/agent/sessions", label: "Sessions" },
      { href: "/admin/agent/metrics", label: "Metrics" },
      { href: "/admin/tickets", label: "Tickets" },
    ],
  },
];

function findActiveTab(pathname: string): TopTab {
  // Match longest prefix
  let best: { tab: TopTab; len: number } | null = null;
  for (const t of TABS) {
    for (const p of t.prefixes) {
      if (pathname.startsWith(p) && (!best || p.length > best.len)) {
        best = { tab: t, len: p.length };
      }
    }
  }
  return best?.tab || TABS[0];
}

function isActiveSub(pathname: string, href: string): boolean {
  // Strip query string for comparison
  const cleanHref = href.split("?")[0];
  if (pathname === cleanHref) return true;
  // Sub-path matches if the next char is "/" (so /admin/content matches /admin/content/articles only for index, not for arbitrary nesting).
  // We want sub-paths under each item to highlight that item — but only if no longer item also matches.
  return pathname.startsWith(cleanHref + "/");
}

function findActiveSub(pathname: string, items: SubItem[]): string | null {
  let best: { href: string; len: number } | null = null;
  for (const it of items) {
    const clean = it.href.split("?")[0];
    if (pathname === clean || pathname.startsWith(clean + "/")) {
      if (!best || clean.length > best.len) best = { href: it.href, len: clean.length };
    }
  }
  return best?.href || null;
}

export function AdminTopNav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const activeTab = findActiveTab(pathname);
  const activeSubHref = findActiveSub(pathname, activeTab.subnav);

  // Poll for inbox badges (pending chats + recent inbound emails) every
  // 30s. Triggers a tab title prefix + favicon badge when there's
  // something needing attention.
  const [badges, setBadges] = useState<InboxBadges>({ pendingChats: 0, recentInboundEmails: 0 });
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const result = await getInboxBadges();
        if (!cancelled) setBadges(result);
      } catch {
        /* swallow */
      }
    }
    poll();
    const id = setInterval(poll, 30_000);
    // Re-poll whenever the tab regains focus so admin sees fresh state
    // when they switch back to a stale tab.
    const focusHandler = () => poll();
    window.addEventListener("focus", focusHandler);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", focusHandler);
    };
  }, []);

  // Set the document title prefix with the total so the unread state
  // is visible even when the admin is on another browser tab.
  useEffect(() => {
    const total = badges.pendingChats + badges.recentInboundEmails;
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = total > 0 ? `(${total}) ${baseTitle}` : baseTitle;
  }, [badges]);

  // Map tab id → badge count so we can render the right number per tab.
  const tabBadges: Record<string, number> = {
    crm: badges.recentInboundEmails,
    support: badges.pendingChats,
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#e4e4e7]">
      <div className="px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-6">
            <Link href="/admin/dashboard" className="text-[15px] font-extrabold tracking-[-0.03em]">
              Penny<span className="text-[#15803d]">Lime</span>
              <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-[#a1a1aa]">Admin</span>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-[#71717a]">
            <span className="hidden sm:inline">{userName}</span>
            <button
              onClick={() => signOut({ callbackUrl: "/admin/login" })}
              className="text-[#71717a] hover:text-black"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Top tabs */}
        <nav className="-mb-px flex items-center gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = t.id === activeTab.id;
            const badgeCount = tabBadges[t.id] ?? 0;
            return (
              <Link
                key={t.id}
                href={t.href}
                className={`relative px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  active ? "text-black" : "text-[#71717a] hover:text-black"
                }`}
              >
                <span className={`mr-1.5 ${badgeCount > 0 ? "text-[#dc2626]" : "text-[#15803d]"}`}>{t.icon}</span>
                {t.label}
                {badgeCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#dc2626] text-white text-[10px] font-bold leading-none animate-pulse">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#15803d]" />}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sub-nav for active tab */}
      <div className="border-t border-[#f4f4f5] bg-[#fafafa]">
        <div className="px-6 py-2 flex items-center gap-1 overflow-x-auto">
          {activeTab.subnav.map((s) => {
            const active = activeSubHref === s.href;
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-md whitespace-nowrap transition-colors ${
                  active ? "bg-white text-black border border-[#e4e4e7]" : "text-[#71717a] hover:text-black hover:bg-white"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
