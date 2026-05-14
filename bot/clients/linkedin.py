"""LinkedIn engagement client. Wraps the unofficial linkedin-api voyager.

Per design, LinkedIn is LIKES ONLY (no follows). Cookies blob is JSON:
  { "username": "...", "password": "...", "cookies": {...optional...} }
The Linkedin() constructor handles session caching internally.
"""
import json
from linkedin_api import Linkedin


class LIClient:
    def __init__(self, cookies_blob: str):
        creds = json.loads(cookies_blob)
        self.api = Linkedin(
            creds["username"],
            creds["password"],
            cookies=creds.get("cookies"),
        )

    def like_recent_post(self, username: str) -> bool:
        # voyager's get_profile_posts is the most reliable per-user feed.
        posts = self.api.get_profile_posts(public_id=username, post_count=1)
        if not posts:
            return False
        urn = posts[0].get("urn")
        if not urn:
            return False
        self.api.react_to_post(urn, reaction_type="LIKE")
        return True

    def follow(self, username: str) -> bool:
        raise NotImplementedError(
            "LinkedIn follows are out of scope per design — skipped"
        )
