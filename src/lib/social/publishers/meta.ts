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

  // Step 2: poll container status until FINISHED (Meta needs to fetch + process the image).
  // Per Meta docs: poll status_code, valid states are IN_PROGRESS, FINISHED, ERROR, EXPIRED, PUBLISHED.
  // Give it up to 60s.
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://graph.facebook.com/v22.0/${container.id}?fields=status_code,status&access_token=${token}`,
    );
    const status = await statusRes.json();
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`IG container failed status: ${JSON.stringify(status)}`);
    }
    if (i === 11) {
      throw new Error(`IG container timed out (still ${status.status_code}) after 60s`);
    }
  }

  // Step 3: publish the container
  const publishUrl = `https://graph.facebook.com/v22.0/${igUserId}/media_publish?creation_id=${container.id}&access_token=${token}`;
  const pubRes = await fetch(publishUrl, { method: "POST" });
  const pub = await pubRes.json();
  if (!pub.id) {
    throw new Error(`IG publish failed: ${JSON.stringify(pub)}`);
  }

  return { platformPostId: pub.id };
}

export async function publishToInstagramReels(
  encryptedAccessToken: string,
  igUserId: string,
  videoUrl: string,
  caption: string,
): Promise<PublishResult> {
  const token = decryptToken(encryptedAccessToken);

  // Step 1: create REELS container (note media_type=REELS + video_url, no image_url)
  const containerUrl = `https://graph.facebook.com/v22.0/${igUserId}/media?media_type=REELS&video_url=${encodeURIComponent(videoUrl)}&caption=${encodeURIComponent(caption)}&share_to_feed=true&access_token=${token}`;
  const containerRes = await fetch(containerUrl, { method: "POST" });
  const container = await containerRes.json();
  if (!container.id) {
    throw new Error(`IG Reels container creation failed: ${JSON.stringify(container)}`);
  }

  // Step 2: poll container status. Reels need longer than images (Meta has to fetch + transcode).
  // Cap at 5 min — Reels usually finish in 60-180s.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://graph.facebook.com/v22.0/${container.id}?fields=status_code,status&access_token=${token}`,
    );
    const status = await statusRes.json();
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`IG Reels container failed status: ${JSON.stringify(status)}`);
    }
    if (i === 59) {
      throw new Error(`IG Reels container timed out (still ${status.status_code}) after 5min`);
    }
  }

  // Step 3: publish
  const publishUrl = `https://graph.facebook.com/v22.0/${igUserId}/media_publish?creation_id=${container.id}&access_token=${token}`;
  const pubRes = await fetch(publishUrl, { method: "POST" });
  const pub = await pubRes.json();
  if (!pub.id) {
    throw new Error(`IG Reels publish failed: ${JSON.stringify(pub)}`);
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
