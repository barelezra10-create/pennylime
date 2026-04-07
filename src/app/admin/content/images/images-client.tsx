"use client";

import { useState } from "react";
import Image from "next/image";

interface ContentImage {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
  altText: string | null;
  createdAt: string;
}

export function ImagesClient({ initialImages }: { initialImages: ContentImage[] }) {
  const [images, setImages] = useState(initialImages);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/content/images", { method: "POST", body: formData });
    if (res.ok) {
      const image = await res.json();
      setImages([image, ...images]);
    }
    setUploading(false);
    e.target.value = "";
  }

  async function handleDelete(image: ContentImage) {
    if (!confirm(`Delete ${image.fileName}?`)) return;
    const res = await fetch("/api/content/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: image.id, storagePath: image.storagePath }),
    });
    if (res.ok) {
      setImages(images.filter((i) => i.id !== image.id));
    }
  }

  function copyPath(path: string) {
    navigator.clipboard.writeText(path);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-black">Image Library</h1>
        <label className="cursor-pointer bg-[#15803d] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-[#166534] transition-colors">
          {uploading ? "Uploading..." : "Upload Image"}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {images.map((image) => (
          <div key={image.id} className="bg-white rounded-[10px] overflow-hidden group">
            <div className="aspect-video relative bg-[#f4f4f5]">
              <Image src={image.storagePath} alt={image.altText || image.fileName} fill className="object-cover" />
            </div>
            <div className="p-3">
              <p className="text-[13px] font-medium text-black truncate">{image.fileName}</p>
              <p className="text-[11px] text-[#a1a1aa]">{(image.fileSize / 1024).toFixed(0)} KB</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => copyPath(image.storagePath)}
                  className="text-[11px] text-[#15803d] hover:underline"
                >
                  Copy Path
                </button>
                <button
                  onClick={() => handleDelete(image)}
                  className="text-[11px] text-red-500 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {images.length === 0 && (
        <p className="text-center text-[#71717a] text-[14px] py-12">No images uploaded yet.</p>
      )}
    </div>
  );
}
