"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TiptapEditor } from "@/components/content/tiptap-editor";
import { createArticle, updateArticle, deleteArticle } from "@/actions/content";
import { slugify, generateExcerpt } from "@/lib/content-helpers";
import { TabBar } from "@/components/admin/tab-bar";

interface Category { id: string; name: string; }
interface Tag { id: string; name: string; }

interface ArticleData {
  id?: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  featuredImage: string;
  categoryId: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  published: boolean;
  publishedAt: string;
  tagIds: string[];
}

const TABS = [
  { id: "content", label: "Content" },
  { id: "seo", label: "SEO" },
  { id: "publish", label: "Publish" },
];

export function ArticleEditorClient({
  article,
  categories,
  tags,
}: {
  article?: ArticleData;
  categories: Category[];
  tags: Tag[];
}) {
  const router = useRouter();
  const isEdit = !!article?.id;
  const [activeTab, setActiveTab] = useState("content");

  const [form, setForm] = useState<ArticleData>({
    title: article?.title || "",
    slug: article?.slug || "",
    body: article?.body || "",
    excerpt: article?.excerpt || "",
    featuredImage: article?.featuredImage || "",
    categoryId: article?.categoryId || "",
    metaTitle: article?.metaTitle || "",
    metaDescription: article?.metaDescription || "",
    ogImage: article?.ogImage || "",
    published: article?.published || false,
    publishedAt: article?.publishedAt || "",
    tagIds: article?.tagIds || [],
  });

  const [saving, setSaving] = useState(false);

  function updateField(field: keyof ArticleData, value: unknown) {
    setForm((prev) => {
      const next = { ...prev, [field]: value } as ArticleData;
      if (field === "title" && !isEdit) {
        next.slug = slugify(value as string);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (isEdit && article?.id) {
        await updateArticle(article.id, {
          ...form,
          excerpt: form.excerpt || generateExcerpt(form.body),
        });
      } else {
        await createArticle({
          ...form,
          excerpt: form.excerpt || generateExcerpt(form.body),
        });
      }
      router.push("/admin/content/articles");
      router.refresh();
    } catch (e) {
      alert("Error saving article");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!article?.id || !confirm("Delete this article?")) return;
    await deleteArticle(article.id);
    router.push("/admin/content/articles");
    router.refresh();
  }

  const inputClass = "w-full text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg bg-white";
  const labelClass = "text-[11px] uppercase tracking-[0.05em] text-[#a1a1aa] mb-1 block";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">
          {isEdit ? "Edit Article" : "New Article"}
        </h1>
        <div className="flex gap-2">
          {isEdit && (
            <button onClick={handleDelete} className="text-[13px] font-medium text-red-500 px-4 py-2 rounded-lg hover:bg-red-50">
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !form.title || !form.slug}
            className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "content" && (
        <div className="space-y-4">
          <input
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="Article title"
            className="w-full text-[20px] font-bold px-4 py-3 border border-[#e4e4e7] rounded-[10px] bg-white"
          />
          <TiptapEditor content={form.body} onChange={(html) => updateField("body", html)} />
          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className={labelClass}>Excerpt</label>
            <textarea
              value={form.excerpt}
              onChange={(e) => updateField("excerpt", e.target.value)}
              rows={2}
              placeholder="Auto-generated from body if empty"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {activeTab === "seo" && (
        <div className="bg-white rounded-[10px] p-4 space-y-4">
          <div>
            <div className="flex justify-between">
              <label className={labelClass}>Meta Title</label>
              <span className="text-[11px] text-[#a1a1aa]">{form.metaTitle.length}/60</span>
            </div>
            <input
              value={form.metaTitle}
              onChange={(e) => updateField("metaTitle", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex justify-between">
              <label className={labelClass}>Meta Description</label>
              <span className="text-[11px] text-[#a1a1aa]">{form.metaDescription.length}/160</span>
            </div>
            <textarea
              value={form.metaDescription}
              onChange={(e) => updateField("metaDescription", e.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Slug</label>
            <input
              value={form.slug}
              onChange={(e) => updateField("slug", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Featured Image</label>
            <input
              value={form.featuredImage}
              onChange={(e) => updateField("featuredImage", e.target.value)}
              placeholder="/uploads/content/..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>OG Image</label>
            <input
              value={form.ogImage}
              onChange={(e) => updateField("ogImage", e.target.value)}
              placeholder="/uploads/content/..."
              className={inputClass}
            />
          </div>
        </div>
      )}

      {activeTab === "publish" && (
        <div className="space-y-4">
          <div className="bg-white rounded-[10px] p-4 space-y-3">
            <h3 className="text-[13px] font-bold text-black">Publish</h3>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.published}
                onChange={(e) => updateField("published", e.target.checked)}
                className="rounded"
              />
              <span className="text-[13px] text-black">Published</span>
            </label>
            <input
              type="datetime-local"
              value={form.publishedAt}
              onChange={(e) => updateField("publishedAt", e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className={labelClass}>Category</label>
            <select
              value={form.categoryId}
              onChange={(e) => updateField("categoryId", e.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-[10px] p-4 space-y-2">
            <label className={labelClass}>Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    const ids = form.tagIds.includes(tag.id)
                      ? form.tagIds.filter((id) => id !== tag.id)
                      : [...form.tagIds, tag.id];
                    updateField("tagIds", ids);
                  }}
                  className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    form.tagIds.includes(tag.id)
                      ? "bg-[#15803d] text-white"
                      : "bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7]"
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
