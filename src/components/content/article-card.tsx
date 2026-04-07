import Link from "next/link";
import Image from "next/image";

interface ArticleCardProps {
  title: string;
  slug: string;
  excerpt: string | null;
  featuredImage: string | null;
  publishedAt: string | null;
  categoryName?: string | null;
}

export function ArticleCard({ title, slug, excerpt, featuredImage, publishedAt, categoryName }: ArticleCardProps) {
  return (
    <Link href={`/blog/${slug}`} className="group block bg-white rounded-[10px] overflow-hidden hover:shadow-md transition-shadow">
      {featuredImage && (
        <div className="aspect-video relative bg-[#f4f4f5]">
          <Image src={featuredImage} alt={title} fill className="object-cover" />
        </div>
      )}
      <div className="p-4">
        {categoryName && <span className="text-[11px] uppercase tracking-[0.05em] text-[#15803d] font-medium">{categoryName}</span>}
        <h3 className="text-[15px] font-bold text-[#1a1a1a] mt-1 group-hover:text-[#15803d] transition-colors">{title}</h3>
        {excerpt && <p className="text-[13px] text-[#71717a] mt-1 line-clamp-2">{excerpt}</p>}
        {publishedAt && <p className="text-[11px] text-[#a1a1aa] mt-2">{new Date(publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
      </div>
    </Link>
  );
}
