"""Rate limits, jitter, waking-hours, daily-cap helpers for the engagement bot.

Tuned conservative — IG flags fast-burst patterns even with valid cookies.
We trade slower visible activity for longer cookie lifetimes."""
import asyncio
import random
from datetime import datetime, timezone

# Daily caps per platform — kept conservative. Real humans don't follow 25
# strangers a day; lower the engagement ceiling so we don't look botty.
CAPS: dict[str, dict[str, int]] = {
    "instagram": {"like": 18, "follow": 4},
    "facebook":  {"like": 18, "follow": 0},
    "linkedin":  {"like": 15, "follow": 0},
    "tiktok":    {"like": 20, "follow": 6},
}


async def jitter() -> None:
    """Sleep 5-30 MINUTES between individual actions (was 45-180s).
    Real humans don't like 3 random posts back-to-back every minute."""
    await asyncio.sleep(random.randint(5 * 60, 30 * 60))


async def micro_jitter() -> None:
    """Short 3-9s pause used inside a single 'session' between sub-steps
    (view profile, scroll feed, then like)."""
    await asyncio.sleep(random.randint(3, 9))


def in_waking_hours() -> bool:
    """Engagement only runs 12:00-04:00 UTC (= 8am-12am US Eastern)."""
    h = datetime.now(timezone.utc).hour
    return h >= 12 or h < 4


def should_skip_this_sweep() -> bool:
    """50% chance to skip any given sweep ('user checked phone, did nothing').
    Spreads quota over the day and breaks the predictable 30-min cadence."""
    return random.random() < 0.5


def next_sweep_delay_seconds() -> int:
    """Variable delay between sweeps: 25-95 min (was fixed 30 min).
    Breaks the exact-half-hour pattern."""
    return random.randint(25 * 60, 95 * 60)


def actions_this_cycle() -> int:
    """How many actions to do in one sweep. 70% chance of 1, 25% of 2, 5% of 3.
    Real users rarely interact with 3+ accounts in a row."""
    r = random.random()
    if r < 0.70: return 1
    if r < 0.95: return 2
    return 3


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
