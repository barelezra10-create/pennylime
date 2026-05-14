"""Facebook engagement client (stub for v1).

Facebook page-level 'like other posts' / 'follow other pages' via
cookie scraping is brittle: most attempts trigger checkpoints. v1
ships with these as NotImplementedError so the bot logs explicit
'skipped' status for FB targets, and we revisit if there's demand.
"""


class FBClient:
    def __init__(self, cookies_blob: str):
        self.cookies_blob = cookies_blob

    def like_recent_post(self, username: str) -> bool:
        raise NotImplementedError(
            "FB likes via cookie scraping not supported in v1 — skipped"
        )

    def follow(self, username: str) -> bool:
        raise NotImplementedError(
            "FB page follows are not a meaningful action — skipped"
        )
