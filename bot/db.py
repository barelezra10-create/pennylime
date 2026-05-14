import os
import asyncpg
from typing import Optional

_pool: Optional[asyncpg.Pool] = None


async def pool() -> asyncpg.Pool:
    """Lazy global connection pool. Uses DATABASE_URL env var."""
    global _pool
    if _pool is None:
        url = os.environ["DATABASE_URL"]
        # Railway uses postgres:// scheme; asyncpg accepts that natively.
        _pool = await asyncpg.create_pool(url, min_size=1, max_size=4)
    return _pool


async def fetch_queued_target(platform: str):
    """Get the oldest queued EngagementTarget for this platform, or None."""
    p = await pool()
    return await p.fetchrow(
        """SELECT id, source, "targetHandle", "targetPostId", action
           FROM "EngagementTarget"
           WHERE platform = $1 AND status = 'queued'
           ORDER BY "createdAt" ASC LIMIT 1""",
        platform,
    )


async def mark_target(id: str, status: str):
    """Mark a target as done/failed/skipped."""
    p = await pool()
    await p.execute(
        """UPDATE "EngagementTarget"
           SET status = $2, "processedAt" = NOW()
           WHERE id = $1""",
        id, status,
    )


async def get_account(platform: str):
    """Look up the @pennylime SocialAccount for this platform."""
    p = await pool()
    return await p.fetchrow(
        """SELECT id, "botCookies", "botStatus" FROM "SocialAccount"
           WHERE platform = $1 AND handle = '@pennylime'""",
        platform,
    )


async def log_engagement(
    account_id: str,
    platform: str,
    action: str,
    target_handle: str,
    target_post_id: Optional[str],
    success: bool,
    error: Optional[str] = None,
):
    """Insert an audit row to EngagementLog."""
    p = await pool()
    await p.execute(
        """INSERT INTO "EngagementLog"
           (id, "accountId", platform, action,
            "targetHandle", "targetPostId", success, error, "createdAt")
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW())""",
        account_id, platform, action, target_handle, target_post_id, success, error,
    )


async def set_bot_status(account_id: str, status: str):
    """Flip the SocialAccount.botStatus (e.g. 'challenged' on rate-limit)."""
    p = await pool()
    await p.execute(
        """UPDATE "SocialAccount"
           SET "botStatus" = $2, "lastBotAction" = NOW(), "updatedAt" = NOW()
           WHERE id = $1""",
        account_id, status,
    )
