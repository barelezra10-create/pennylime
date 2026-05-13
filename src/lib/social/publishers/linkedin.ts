import "server-only";
import { decryptToken } from "../crypto";

interface PublishResult {
  platformPostId: string;
}

export async function publishToLinkedIn(
  encryptedAccessToken: string,
  organizationId: string,  // numeric org id (no urn: prefix)
  imageUrl: string,
  text: string,
): Promise<PublishResult> {
  const token = decryptToken(encryptedAccessToken);
  const author = `urn:li:organization:${organizationId}`;

  // Step 1: register upload
  const regRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      registerUploadRequest: {
        owner: author,
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        serviceRelationships: [
          { identifier: "urn:li:userGeneratedContent", relationshipType: "OWNER" },
        ],
      },
    }),
  });
  const reg = await regRes.json();
  const uploadUrl =
    reg?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
      ?.uploadUrl;
  const asset = reg?.value?.asset;
  if (!uploadUrl || !asset) {
    throw new Error(`LI register upload failed: ${JSON.stringify(reg)}`);
  }

  // Step 2: download image bytes from our serving route, upload to LI's pre-signed URL
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`LI image fetch from our storage failed (${imgRes.status}): ${imageUrl}`);
  }
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: new Uint8Array(imgBuf),
  });
  if (!upRes.ok) {
    throw new Error(`LI image upload to LinkedIn failed: ${upRes.status} ${await upRes.text()}`);
  }

  // Step 3: create the UGC post referencing the uploaded asset
  const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text },
          shareMediaCategory: "IMAGE",
          media: [{ status: "READY", media: asset }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  const post = await postRes.json();
  if (!post.id) {
    throw new Error(`LI ugcPost create failed (${postRes.status}): ${JSON.stringify(post)}`);
  }

  return { platformPostId: post.id };
}
