"""Rate limits, jitter, waking-hours, daily-cap helpers for the engagement bot."""
import asyncio
import random
from datetime import datetime, timezone

# Daily caps per platform -- must match src/lib/social/engagement/builder.ts
CAPS: dict[str, dict[str, int]] = {
    "instagram": {"like": 25, "follow": 7},
    "facebook":  {"like": 25, "follow": 0},
    "linkedin":  {"like": 20, "follow": 0},
    "tiktok":    {"like": 30, "follow": 8},
}


async def jitter() -> None:
    """Sleep 45-180 seconds between actions to look human."""
    await asyncio.sleep(random.randint(45, 180))


def in_waking_hours() -> bool:
    """Engagement only runs 12:00-04:00 UTC (= 8am-12am US Eastern)."""
    h = datetime.now(timezone.utc).hour
    return h >= 12 or h < 4


async def daily_count(pool, account_id: str, action: str) -> int:
    """How many successful actions of this type has this account done today (UTC)?"""
    row = await pool.fetchrow(
        '''SELECT COUNT(*) AS n FROM "EngagementLog"
           WHERE "accountId" = $1
             AND action = $2
             AND success = true
             AND "createdAt" >= date_trunc('day', NOW() AT TIME ZONE 'UTC')''',
        account_id, action,
    )
    return row["n"] if row else 0


def under_cap(platform: str, action: str, count: int) -> bool:
    """Has this platform/action stayed under its daily cap?"""
    cap = CAPS.get(platform, {}).get(action, 0)
    return count < cap
