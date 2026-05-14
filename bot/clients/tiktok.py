"""TikTok engagement client (stub for v1).

TikTokApi v6+ does not reliably expose like/follow actions through
the public surface — they require browser automation that's flaky
and gets blocked quickly. v1 raises NotImplementedError; the main
loop translates this to 'skipped' status. Revisit if a stable
TikTok engagement library appears or we add a custom shim.
"""
from TikTokApi import TikTokApi  # noqa: F401  (kept for type/dep reference)


class TTClient:
    def __init__(self, cookies_blob: str):
        self.cookies_blob = cookies_blob

    async def like_recent_post(self, username: str) -> bool:
        raise NotImplementedError(
            "TikTok like via TikTokApi requires custom endpoint shim — skipped in v1"
        )

    async def follow(self, username: str) -> bool:
        raise NotImplementedError(
            "TikTok follow requires custom endpoint shim — skipped in v1"
        )
