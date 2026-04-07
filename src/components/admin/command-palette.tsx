"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface CommandItem {
  id: string;
  label: string;
  href?: string;
  group: string;
  icon?: React.ReactNode;
}

const NAV_ITEMS: CommandItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin/dashboard", group: "Navigate" },
  { id: "pipeline", label: "Pipeline", href: "/admin/pipeline", group: "Navigate" },
  { id: "contacts", label: "Contacts", href: "/admin/contacts", group: "Navigate" },
  { id: "abandoned", label: "Abandoned Apps", href: "/admin/abandoned", group: "Navigate" },
  { id: "email", label: "Email Marketing", href: "/admin/email", group: "Navigate" },
  { id: "applications", label: "Applications", href: "/admin/applications", group: "Navigate" },
  { id: "payments", label: "Payments", href: "/admin/payments", group: "Navigate" },
  { id: "content", label: "Content", href: "/admin/content", group: "Navigate" },
  { id: "landing-pages", label: "Landing Pages", href: "/admin/content/landing-pages", group: "Navigate" },
  { id: "articles", label: "Articles", href: "/admin/content/articles", group: "Navigate" },
  { id: "settings", label: "Settings", href: "/admin/settings", group: "Navigate" },
  { id: "audit", label: "Audit Log", href: "/admin/audit", group: "Navigate" },
  { id: "team", label: "Team", href: "/admin/team", group: "Navigate" },
  { id: "new-article", label: "New Article", href: "/admin/content/articles/new", group: "Create" },
  { id: "new-lp", label: "New Landing Page", href: "/admin/content/landing-pages/new", group: "Create" },
  { id: "new-campaign", label: "New Campaign", href: "/admin/email/campaigns/new", group: "Create" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = query
    ? NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : NAV_ITEMS;

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  const flatItems = Object.values(grouped).flat();

  const select = useCallback((item: CommandItem) => {
    setOpen(false);
    if (item.href) router.push(item.href);
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIndex]) {
      select(flatItems[selectedIndex]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative w-full max-w-[520px] bg-white rounded-2xl shadow-2xl border border-[#e4e4e7] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e4e4e7]">
          <svg className="w-5 h-5 text-[#a1a1aa]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search pages, contacts, actions..."
            className="flex-1 text-[14px] outline-none placeholder:text-[#a1a1aa]"
          />
          <kbd className="text-[11px] text-[#a1a1aa] bg-[#f4f4f5] px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto py-2">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a1a1aa]">{group}</p>
              {items.map((item) => {
                const idx = flatItems.indexOf(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => select(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-[13px] text-left transition-colors ${
                      idx === selectedIndex ? "bg-[#f0f5f0] text-[#15803d]" : "text-black hover:bg-[#f4f4f5]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
          {flatItems.length === 0 && (
            <p className="px-4 py-6 text-[13px] text-[#a1a1aa] text-center">No results for &ldquo;{query}&rdquo;</p>
          )}
        </div>
      </div>
    </div>
  );
}
