import Link from "next/link";
import { JsonLd, breadcrumbSchema } from "./json-ld";

interface BreadcrumbItem {
  label: string;
  href: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const schemaItems = items.map((item) => ({
    name: item.label,
    url: `https://pennylime.com${item.href}`,
  }));

  return (
    <>
      <JsonLd data={breadcrumbSchema(schemaItems)} />
      <nav aria-label="Breadcrumb" className="text-[13px] text-[#71717a] mb-6">
        {items.map((item, i) => (
          <span key={item.href}>
            {i > 0 && <span className="mx-1.5">/</span>}
            {i === items.length - 1 ? (
              <span className="text-[#1a1a1a]">{item.label}</span>
            ) : (
              <Link href={item.href} className="hover:text-[#15803d] transition-colors">
                {item.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
