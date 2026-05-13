import "server-only";
import type { Platform } from "../types";
import { publishToInstagram, publishToFacebook } from "./meta";
import { publishToLinkedIn } from "./linkedin";
import { publishToTikTok } from "./tiktok";

interface PublishArgs {
  platform: Platform;
  encryptedAccessToken: string;
  platformAccountId: string;  // IG business user id / FB page id / LI org id (TikTok ignores)
  imageUrl: string;
  body: string;
}

interface PublishResult {
  platformPostId: string;
}

export async function publish(args: PublishArgs): Promise<PublishResult> {
  switch (args.platform) {
    case "instagram":
      return publishToInstagram(
        args.encryptedAccessToken,
        args.platformAccountId,
        args.imageUrl,
        args.body,
      );
    case "facebook":
      return publishToFacebook(
        args.encryptedAccessToken,
        args.platformAccountId,
        args.imageUrl,
        args.body,
      );
    case "linkedin":
      return publishToLinkedIn(
        args.encryptedAccessToken,
        args.platformAccountId,
        args.imageUrl,
        args.body,
      );
    case "tiktok":
      return publishToTikTok(
        args.encryptedAccessToken,
        args.imageUrl,
        args.body,
      );
  }
}
