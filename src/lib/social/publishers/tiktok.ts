import "server-only";
import { decryptToken } from "../crypto";

interface PublishResult {
  platformPostId: string;
}

export async function publishToTikTok(
  encryptedAccessToken: string,
  imageUrl: string,
  caption: string,
): Promise<PublishResult> {
  const token = decryptToken(encryptedAccessToken);

  // Step 1: init the publish (PULL_FROM_URL — TikTok fetches the image from us)
  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 90),
        description: caption,
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_comment: false,
        auto_add_music: true,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: [imageUrl],
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    }),
  });
  const init = await initRes.json();
  const publishId: string | undefined = init?.data?.publish_id;
  if (!publishId) {
    throw new Error(`TT init failed (${initRes.status}): ${JSON.stringify(init)}`);
  }

  // Step 2: poll status (TikTok publishes async, give it up to 60s)
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const status = await statusRes.json();
    const s = status?.data?.status;
    if (s === "PUBLISH_COMPLETE") {
      return { platformPostId: publishId };
    }
    if (s === "FAILED") {
      throw new Error(`TT publish failed (publish_id=${publishId}): ${JSON.stringify(status)}`);
    }
  }
  throw new Error(`TT publish timeout after 60s (publish_id=${publishId})`);
}
