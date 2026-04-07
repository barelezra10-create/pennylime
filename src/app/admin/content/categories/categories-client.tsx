"use client";

import { useState } from "react";
import { createCategory, deleteCategory, createTag, deleteTag } from "@/actions/content";
import { slugify } from "@/lib/content-helpers";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

interface Tag {
  id: string;
  name: string;
  slug: string;
}

export function CategoriesClient({
  initialCategories,
  initialTags,
}: {
  initialCategories: Category[];
  initialTags: Tag[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [tags, setTags] = useState(initialTags);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [tagName, setTagName] = useState("");

  async function handleAddCategory() {
    if (!catName.trim()) return;
    const cat = await createCategory({ name: catName.trim(), slug: slugify(catName), description: catDesc || undefined });
    setCategories([...categories, cat]);
    setCatName("");
    setCatDesc("");
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm("Delete this category?")) return;
    await deleteCategory(id);
    setCategories(categories.filter((c) => c.id !== id));
  }

  async function handleAddTag() {
    if (!tagName.trim()) return;
    const tag = await createTag({ name: tagName.trim(), slug: slugify(tagName) });
    setTags([...tags, tag]);
    setTagName("");
  }

  async function handleDeleteTag(id: string) {
    if (!confirm("Delete this tag?")) return;
    await deleteTag(id);
    setTags(tags.filter((t) => t.id !== id));
  }

  return (
    <div>
      <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black mb-6">Categories & Tags</h1>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <h2 className="text-[15px] font-bold text-black mb-4">Categories</h2>
          <div className="flex gap-2 mb-4">
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Category name"
              className="flex-1 text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg"
            />
            <input
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              placeholder="Description (optional)"
              className="flex-1 text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg"
            />
            <button onClick={handleAddCategory} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">
              Add
            </button>
          </div>
          <div className="space-y-2">
            {categories.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between bg-white rounded-[10px] px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-black">{cat.name}</p>
                  <p className="text-[11px] text-[#a1a1aa]">/{cat.slug}</p>
                </div>
                <button onClick={() => handleDeleteCategory(cat.id)} className="text-[11px] text-red-500 hover:underline">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-[15px] font-bold text-black mb-4">Tags</h2>
          <div className="flex gap-2 mb-4">
            <input
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="Tag name"
              className="flex-1 text-[13px] px-3 py-2 border border-[#e4e4e7] rounded-lg"
            />
            <button onClick={handleAddTag} className="bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534]">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-[12px] text-black">
                {tag.name}
                <button onClick={() => handleDeleteTag(tag.id)} className="text-red-400 hover:text-red-600">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
