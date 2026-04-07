import { getContentImages } from "@/actions/content";
import { ImagesClient } from "./images-client";

export default async function ImagesPage() {
  const images = await getContentImages();
  return <ImagesClient initialImages={images.map(i => ({ ...i, createdAt: i.createdAt.toISOString() }))} />;
}
