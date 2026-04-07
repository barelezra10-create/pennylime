"use client";

import { useEffect, useState } from "react";

interface TocItem { id: string; text: string; level: number; }

export function TableOfContents({ html }: { html: string }) {
  const [items, setItems] = useState<TocItem[]>([]);

  useEffect(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const headings = doc.querySelectorAll("h2, h3");
    const tocItems: TocItem[] = [];
    headings.forEach((h) => {
      const id = h.textContent?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "";
      tocItems.push({ id, text: h.textContent || "", level: h.tagName === "H2" ? 2 : 3 });
    });
    setItems(tocItems);
  }, [html]);

  if (items.length < 3) return null;

  return (
    <nav className="bg-[#f8faf8] rounded-[10px] p-4 mb-8">
      <h3 className="text-[13px] font-bold text-[#1a1a1a] mb-2">Table of Contents</h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? "ml-4" : ""}>
            <a href={`#${item.id}`} className="text-[13px] text-[#15803d] hover:underline">{item.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
