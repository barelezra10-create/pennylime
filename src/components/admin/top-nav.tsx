"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
      { href: "/admin/content/seo-calendar", label: "SEO Calendar" },
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
    prefixes: ["/admin/contacts", "/admin/pipeline", "/admin/abandoned", "/admin/team", "/admin/visitors", "/admin/inbox", "/admin/compliance", "/admin/calls"],
    href: "/admin/contacts",
    subnav: [
      { href: "/admin/contacts", label: "Contacts" },
      { href: "/admin/inbox", label: "Inbox" },
      { href: "/admin/visitors", label: "Visitors" },
      { href: "/admin/pipeline", label: "Pipeline" },
      { href: "/admin/abandoned", label: "Abandoned" },
      { href: "/admin/calls", label: "Calls" },
      { href: "/admin/team", label: "Team" },
      { href: "/admin/compliance", label: "Compliance" },
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
  // something needing attention. Also fires a browser desktop
  // notification when the inbound email count goes UP (not on initial
  // load — only when something arrives while admin is logged in).
  const [badges, setBadges] = useState<InboxBadges>({
    pendingChats: 0,
    unrepliedEmails: 0,
    unrepliedSenders: [],
  });
  const seenContactIds = useRef<Set<string>>(new Set());
  const initialPollDone = useRef<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    // Ask for desktop-notification permission once. Browser remembers
    // the choice (granted/denied) so this is essentially a no-op on
    // subsequent sessions.
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    async function poll() {
      try {
        const result = await getInboxBadges();
        if (cancelled) return;
        // Identify NEW senders since the last poll. First poll just
        // records baseline so we don't spam notifications on initial
        // page load with the existing backlog.
        if (initialPollDone.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const sender of result.unrepliedSenders) {
            if (!seenContactIds.current.has(sender.contactId)) {
              try {
                new Notification(
                  `New email from ${sender.name}`,
                  {
                    body: sender.latestSubject + (sender.preview ? `\n${sender.preview}` : ""),
                    icon: "/lime-mark-256.png",
                    tag: `pennylime-inbox-${sender.contactId}`, // dedupes per-contact
                  },
                );
              } catch {
                /* swallow */
              }
            }
          }
        }
        // Update the seen set to the current set of unreplied senders.
        seenContactIds.current = new Set(result.unrepliedSenders.map((s) => s.contactId));
        initialPollDone.current = true;
        setBadges(result);
      } catch {
        /* swallow */
      }
    }
    poll();
    const id = setInterval(poll, 30_000);
    const focusHandler = () => poll();
    window.addEventListener("focus", focusHandler);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", focusHandler);
    };
  }, []);

  // Inbox dropdown — opens when admin clicks the CRM tab badge.
  const [inboxOpen, setInboxOpen] = useState(false);
  const inboxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!inboxOpen) return;
    function onClick(e: MouseEvent) {
      if (inboxRef.current && !inboxRef.current.contains(e.target as Node)) {
        setInboxOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [inboxOpen]);

  // Set the document title prefix with the total so the unread state
  // is visible even when the admin is on another browser tab.
  useEffect(() => {
    const total = badges.pendingChats + badges.unrepliedEmails;
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = total > 0 ? `(${total}) ${baseTitle}` : baseTitle;
  }, [badges]);

  // Map tab id → badge count so we can render the right number per tab.
  const tabBadges: Record<string, number> = {
    crm: badges.unrepliedEmails,
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
            {/* Inbox bell — shows who has pending emails by name. Click to
                open a dropdown listing senders + subject + preview. */}
            <div ref={inboxRef} className="relative">
              <button
                type="button"
                onClick={() => setInboxOpen((v) => !v)}
                className="relative inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[#fafafa] text-[#52525b]"
                title={`${badges.unrepliedEmails} unreplied email${badges.unrepliedEmails === 1 ? "" : "s"}`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                {badges.unrepliedEmails > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-[#dc2626] text-white text-[9px] font-bold leading-none">
                    {badges.unrepliedEmails > 9 ? "9+" : badges.unrepliedEmails}
                  </span>
                )}
              </button>
              {inboxOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-96 bg-white rounded-xl border border-[#e4e4e7] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.12)] overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-[#f4f4f5] flex items-center justify-between">
                    <p className="text-[12px] font-bold text-[#0a0a0a] uppercase tracking-[0.05em]">
                      Unreplied emails
                    </p>
                    <span className="text-[11px] text-[#71717a]">
                      {badges.unrepliedEmails === 0 ? "All caught up" : `${badges.unrepliedEmails} pending`}
                    </span>
                  </div>
                  {badges.unrepliedSenders.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[12px] text-[#a1a1aa]">
                      No unreplied emails. Good work.
                    </div>
                  ) : (
                    <ul className="max-h-[420px] overflow-y-auto">
                      {badges.unrepliedSenders.map((s) => {
                        // Stranger emails come back with `inbox:<id>` as the
                        // contactId sentinel - route those to /admin/inbox
                        // instead of /admin/contacts/[id].
                        const isInboxLink = s.contactId.startsWith("inbox:");
                        const href = isInboxLink
                          ? `/admin/inbox`
                          : `/admin/contacts/${s.contactId}?tab=email`;
                        return (
                        <li key={s.contactId} className="border-b border-[#f4f4f5] last:border-0">
                          <Link
                            href={href}
                            onClick={() => setInboxOpen(false)}
                            className="block px-4 py-3 hover:bg-[#fafafa] transition-colors"
                          >
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-[13px] font-bold text-[#0a0a0a] truncate flex-1">
                                {s.name}
                              </p>
                              <span className="text-[10px] text-[#a1a1aa]">
                                {new Date(s.receivedAt).toLocaleString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#71717a] truncate mb-1">{s.email}</p>
                            <p className="text-[12px] font-semibold text-[#1a1a1a] truncate" title={s.latestSubject}>
                              {s.latestSubject}
                            </p>
                            {s.preview && (
                              <p className="text-[11px] text-[#52525b] line-clamp-1 mt-0.5">{s.preview}</p>
                            )}
                          </Link>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
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
