"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { LogoMark } from "@/components/brand/logo";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const ICON_CLASS = "w-[20px] h-[20px]";

// Simple SVG icons inline (avoid lucide dependency for sidebar)
function DashboardIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Z" /></svg>; }
function PipelineIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m-2.25-3V6" /></svg>; }
function ContactsIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>; }
function AbandonedIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>; }
function EmailIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>; }
function AppsIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" /></svg>; }
function PaymentsIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>; }
function ContentIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" /></svg>; }
function SettingsIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>; }
function AuditIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>; }
function TeamIcon() { return <svg className={ICON_CLASS} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>; }
function CollapseIcon({ collapsed }: { collapsed: boolean }) { return <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={collapsed ? "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" : "M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25"} /></svg>; }

const NAV_GROUPS: NavGroup[] = [
  {
    title: "MAIN",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
      { href: "/admin/pipeline", label: "Pipeline", icon: <PipelineIcon /> },
    ],
  },
  {
    title: "CRM",
    items: [
      { href: "/admin/contacts", label: "Contacts", icon: <ContactsIcon /> },
      { href: "/admin/abandoned", label: "Abandoned Apps", icon: <AbandonedIcon /> },
    ],
  },
  {
    title: "EMAIL",
    items: [
      { href: "/admin/email", label: "Overview", icon: <EmailIcon /> },
      { href: "/admin/email/campaigns", label: "Campaigns", icon: <EmailIcon /> },
      { href: "/admin/email/sequences", label: "Sequences", icon: <EmailIcon /> },
      { href: "/admin/email/templates", label: "Templates", icon: <EmailIcon /> },
    ],
  },
  {
    title: "LENDING",
    items: [
      { href: "/admin/applications", label: "Applications", icon: <AppsIcon /> },
      { href: "/admin/payments", label: "Payments", icon: <PaymentsIcon /> },
    ],
  },
  {
    title: "CONTENT",
    items: [
      { href: "/admin/content", label: "Overview", icon: <ContentIcon /> },
      { href: "/admin/content/landing-pages", label: "Landing Pages", icon: <ContentIcon /> },
      { href: "/admin/content/articles", label: "Articles", icon: <ContentIcon /> },
      { href: "/admin/content/platforms", label: "Platform Pages", icon: <ContentIcon /> },
      { href: "/admin/content/states", label: "State Pages", icon: <ContentIcon /> },
      { href: "/admin/content/form-templates", label: "Form Templates", icon: <ContentIcon /> },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { href: "/admin/settings", label: "Settings", icon: <SettingsIcon /> },
      { href: "/admin/audit", label: "Audit Log", icon: <AuditIcon /> },
      { href: "/admin/team", label: "Team", icon: <TeamIcon /> },
    ],
  },
];

export function AdminSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(NAV_GROUPS.map((g) => g.title)));

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1280px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setCollapsed(e.matches);
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleGroup = (title: string) => {
    const next = new Set(openGroups);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    setOpenGroups(next);
  };

  const initials = userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <aside className={`${collapsed ? "w-[68px]" : "w-[260px]"} bg-white h-screen fixed flex flex-col border-r border-[#e4e4e7] transition-all duration-200 z-40`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        {!collapsed && (
          <span className="inline-flex items-center gap-2.5 font-extrabold text-[18px] tracking-[-0.03em]">
            <LogoMark size={32} />
            Penny<span className="text-[#15803d]">Lime</span>
          </span>
        )}
        {collapsed && <LogoMark size={28} className="mx-auto" />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-[#71717a] hover:bg-[#f4f4f5] transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <CollapseIcon collapsed={collapsed} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <button
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-3 pt-5 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#a1a1aa] hover:text-[#71717a]"
              >
                {group.title}
                <svg className={`w-3.5 h-3.5 transition-transform ${openGroups.has(group.title) ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
              </button>
            )}
            {(collapsed || openGroups.has(group.title)) && (
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = item.href === "/admin/email" || item.href === "/admin/content"
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all ${
                        active
                          ? "bg-[#f0f5f0] text-[#15803d] border-l-[3px] border-[#15803d]"
                          : "text-[#52525b] hover:bg-[#f4f4f5] hover:text-black"
                      } ${collapsed ? "justify-center px-2" : ""}`}
                    >
                      <span className={active ? "text-[#15803d]" : "text-[#a1a1aa] group-hover:text-[#52525b]"}>{item.icon}</span>
                      {!collapsed && item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className={`px-3 py-3 border-t border-[#e4e4e7] ${collapsed ? "px-2" : ""}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 px-2 py-1.5"}`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#15803d] to-[#166534] text-[11px] font-bold text-white shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-[13px] font-medium text-black">{userName}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className={`mt-1.5 flex w-full items-center gap-3 rounded-lg py-2 text-[13px] font-medium text-[#71717a] transition-colors hover:bg-red-50 hover:text-red-600 ${collapsed ? "justify-center px-2" : "px-4"}`}
        >
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
          {!collapsed && "Sign Out"}
        </button>
      </div>
    </aside>
  );
}
