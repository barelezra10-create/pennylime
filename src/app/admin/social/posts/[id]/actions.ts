"use server";
import { revalidatePath } from "next/cache";
import { regeneratePlanned } from "@/lib/social/generate-and-store";

export async function regenerateAction(formData: FormData) {
  const postId = String(formData.get("postId"));
  await regeneratePlanned(postId);
  revalidatePath(`/admin/social/posts/${postId}`);
}
