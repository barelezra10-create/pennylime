"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

interface Article {
  title: string;
  slug: string;
  excerpt: string | null;
  featuredImage: string | null;
  publishedAt: string | null;
  categoryName: string | null;
}

interface BlogPreviewProps {
  articles: Article[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BlogPreview({ articles }: BlogPreviewProps) {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const ctx = gsap.context(() => {
      const cards = sectionRef.current!.querySelectorAll(".blog-card");
      gsap.fromTo(
        Array.from(cards),
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 65%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-white py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#f0f5f0] text-[#15803d] text-[11px] font-semibold px-3 py-1.5 rounded-full mb-4 tracking-[0.04em] uppercase">
              Resources
            </div>
            <h2
              className="font-extrabold tracking-[-0.04em] leading-[0.95] text-[#1a1a1a]"
              style={{ fontSize: "clamp(32px, 4vw, 52px)" }}
            >
              From the blog.
            </h2>
          </div>
          <Link
            href="/blog"
            className="hidden md:flex items-center gap-2 text-[#15803d] font-semibold text-[14px] hover:underline"
          >
            All articles
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        {articles.length === 0 ? (
          <div className="text-center py-20 bg-[#faf8f0] rounded-2xl border border-dashed border-[#d4d4d8]">
            {/* Hand-drawn open book SVG */}
            <svg className="mx-auto mb-6" width="80" height="60" viewBox="0 0 80 60" fill="none" aria-hidden="true">
              <path d="M40 10 L40 52" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M40 10 C30 8, 10 12, 6 16 L6 52 C10 48, 30 46, 40 50" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M40 10 C50 8, 70 12, 74 16 L74 52 C70 48, 50 46, 40 50" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M14 22 L34 22M14 28 L30 28M14 34 L26 34" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M46 22 L66 22M50 28 L66 28M54 34 L66 34" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <h3 className="font-bold text-[#1a1a1a] text-[18px] mb-2">Coming soon</h3>
            <p className="text-[#71717a] text-[15px] max-w-sm mx-auto mb-6">
              Guides, tips, and resources for gig workers are on their way.
            </p>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 bg-[#15803d] text-white font-semibold text-[14px] px-6 py-3 rounded-xl hover:bg-[#166534] transition-colors"
            >
              Visit the blog
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {articles.map((article, i) => (
              <Link
                key={i}
                href={`/blog/${article.slug}`}
                className="blog-card group block bg-[#faf8f0] rounded-2xl border border-[#e4e4e7] overflow-hidden hover:border-[#15803d]/30 hover:shadow-lg transition-all duration-200"
              >
                {/* Image or placeholder */}
                {article.featuredImage ? (
                  <div
                    className="w-full h-44 bg-cover bg-center"
                    style={{ backgroundImage: `url(${article.featuredImage})` }}
                  />
                ) : (
                  <div className="w-full h-44 bg-[#f0f5f0] flex items-center justify-center">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                      <rect x="6" y="8" width="36" height="32" rx="4" stroke="#15803d" strokeWidth="2" />
                      <path d="M14 20h20M14 26h14M14 32h8" stroke="#15803d" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
                <div className="p-5">
                  {article.categoryName && (
                    <div className="text-[#15803d] text-[11px] font-semibold uppercase tracking-[0.05em] mb-2">
                      {article.categoryName}
                    </div>
                  )}
                  <h3 className="font-bold text-[#1a1a1a] text-[15px] leading-tight mb-2 group-hover:text-[#15803d] transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  {article.excerpt && (
                    <p className="text-[#71717a] text-[13px] leading-relaxed line-clamp-2 mb-3">
                      {article.excerpt}
                    </p>
                  )}
                  {article.publishedAt && (
                    <div className="text-[#a1a1aa] text-[11px]">
                      {formatDate(article.publishedAt)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8 text-center md:hidden">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-[#15803d] font-semibold text-[14px] hover:underline"
          >
            See all articles →
          </Link>
        </div>
      </div>
    </section>
  );
}
