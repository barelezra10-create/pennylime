import "server-only";
import { decryptToken } from "../crypto";

interface PublishResult {
  platformPostId: string;
}

export async function publishToInstagram(
  encryptedAccessToken: string,
  igUserId: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  const token = decryptToken(encryptedAccessToken);

  // Step 1: create container
  const containerUrl = `https://graph.facebook.com/v22.0/${igUserId}/media?image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${token}`;
  const containerRes = await fetch(containerUrl, { method: "POST" });
  const container = await containerRes.json();
  if (!container.id) {
    throw new Error(`IG container creation failed: ${JSON.stringify(container)}`);
  }

  // Step 2: publish the container
  const publishUrl = `https://graph.facebook.com/v22.0/${igUserId}/media_publish?creation_id=${container.id}&access_token=${token}`;
  const pubRes = await fetch(publishUrl, { method: "POST" });
  const pub = await pubRes.json();
  if (!pub.id) {
    throw new Error(`IG publish failed: ${JSON.stringify(pub)}`);
  }

  return { platformPostId: pub.id };
}

export async function publishToFacebook(
  encryptedPageToken: string,
  pageId: string,
  imageUrl: string,
  message: string,
): Promise<PublishResult> {
  const token = decryptToken(encryptedPageToken);

  const photoUrl = `https://graph.facebook.com/v22.0/${pageId}/photos?url=${encodeURIComponent(imageUrl)}&message=${encodeURIComponent(message)}&access_token=${token}`;
  const res = await fetch(photoUrl, { method: "POST" });
  const json = await res.json();
  if (!json.id) {
    throw new Error(`FB publish failed: ${JSON.stringify(json)}`);
  }

  // FB photo endpoint returns either { id, post_id } (post created) or { id } (just photo).
  // Prefer post_id when available so we have the canonical post identifier.
  return { platformPostId: json.post_id ?? json.id };
}
