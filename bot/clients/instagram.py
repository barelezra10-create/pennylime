"""Instagram engagement client. Wraps instagrapi.

The session cookies blob is stored encrypted in SocialAccount.botCookies
(JSON form of instagrapi's get_settings() output). This client loads
those settings into a fresh Client and supports:
  - finding a recent poster by hashtag (for __resolve_at_runtime__ targets)
  - liking that user's most recent post
  - following that user
"""
import json
from instagrapi import Client
from instagrapi.exceptions import (
    ChallengeRequired,
    LoginRequired,
    ClientError,
    PleaseWaitFewMinutes,
)


class IGClient:
    def __init__(self, cookies_blob: str):
        """cookies_blob is a JSON string from instagrapi's `cl.get_settings()`."""
        self.cl = Client()
        settings = json.loads(cookies_blob)
        self.cl.set_settings(settings)
        # set_settings primes the client; if the session is still valid,
        # subsequent calls just work. If it's expired, the next API call
        # raises LoginRequired or ChallengeRequired which the safety
        # layer in main.py will translate into botStatus="challenged".

    def find_user_by_hashtag(self, hashtag: str) -> str | None:
        """Resolve a recent poster on this hashtag. Returns username or None."""
        try:
            medias = self.cl.hashtag_medias_recent(hashtag.lstrip("#"), amount=5)
            if not medias:
                return None
            chosen = medias[0]
            return chosen.user.username
        except (ClientError, ChallengeRequired, LoginRequired, PleaseWaitFewMinutes):
            raise

    def like_recent_post(self, username: str) -> bool:
        """Like the user's most recent post. Returns True on success."""
        user_id = self.cl.user_id_from_username(username)
        medias = self.cl.user_medias(user_id, amount=1)
        if not medias:
            return False
        return self.cl.media_like(medias[0].id)

    def follow(self, username: str) -> bool:
        """Follow the user. Returns True on success."""
        user_id = self.cl.user_id_from_username(username)
        return self.cl.user_follow(user_id)
