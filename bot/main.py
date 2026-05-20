"""PennyLime engagement bot main loop.

Wakes every 30 minutes, processes EngagementTarget queue across the 4
platforms during waking hours (12:00-04:00 UTC). Honors per-platform daily
caps (CAPS in safety.py). Backs off on rate limits, pauses accounts on
challenges. NotImplementedError on FB/TT clients translates to 'skipped'.
"""
import os
import sys

# Bail before any heavy imports when the kill switch is set at startup.
if __name__ == "__main__" and os.environ.get("SOCIAL_BOT_ENABLED", "true").lower() == "false":
    print("Bot disabled via SOCIAL_BOT_ENABLED=false", flush=True)
    sys.exit(0)

import asyncio
import random
import traceback
from datetime import datetime, timezone

from db import (
    pool,
    fetch_queued_target,
    mark_target,
    get_account,
    log_engagement,
    set_bot_status,
)
from safety import (
    jitter, micro_jitter, in_waking_hours, daily_count, under_cap,
    should_skip_this_sweep, next_sweep_delay_seconds, actions_this_cycle,
)
from crypto import decrypt_token

PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok"]
RATE_LIMIT_BACKOFF_SECONDS = 10 * 60  # 10 min on rate hit


def _get_client(platform: str, cookies_blob: str):
    """Lazy-import per platform so a missing dep doesn't kill the whole bot."""
    if platform == "instagram":
        from clients.instagram import IGClient
        return IGClient(cookies_blob)
    if platform == "linkedin":
        from clients.linkedin import LIClient
        return LIClient(cookies_blob)
    if platform == "facebook":
        from clients.facebook import FBClient
        return FBClient(cookies_blob)
    if platform == "tiktok":
        from clients.tiktok import TTClient
        return TTClient(cookies_blob)
    raise ValueError(f"unknown platform: {platform}")


async def _resolve_handle(client, platform: str, source: str, original_handle: str) -> str | None:
    """If targetHandle is the placeholder, resolve a real handle from the source."""
    if original_handle != "__resolve_at_runtime__":
        return original_handle
    if not source.startswith("hashtag:#"):
        return None
    hashtag = source[len("hashtag:#"):]
    if platform == "instagram":
        return client.find_user_by_hashtag(hashtag)
    # Other platforms don't have hashtag-based resolution in their stubs.
    return None


async def _process_target(platform: str, target, account, cookies: str) -> None:
    """Run one engagement action. Logs result and updates target status."""
    client = _get_client(platform, cookies)
    handle = await _resolve_handle(client, platform, target["source"], target["targetHandle"])
    if not handle:
        await mark_target(target["id"], "skipped")
        await log_engagement(
            account["id"], platform, target["action"],
            target["targetHandle"], target["targetPostId"],
            False, "could not resolve handle from source",
        )
        return

    success = False
    error: str | None = None

    try:
        if target["action"] == "like":
            if platform == "tiktok":
                success = await client.like_recent_post(handle)
            else:
                success = client.like_recent_post(handle)
        elif target["action"] == "follow":
            if platform == "tiktok":
                success = await client.follow(handle)
            else:
                success = client.follow(handle)
    except NotImplementedError as e:
        await mark_target(target["id"], "skipped")
        await log_engagement(
            account["id"], platform, target["action"],
            handle, target["targetPostId"],
            False, str(e),
        )
        return
    except Exception as e:
        error = f"{type(e).__name__}: {str(e)[:200]}"
        msg = str(e).lower()
        if "challenge_required" in msg or "checkpoint" in msg:
            await set_bot_status(account["id"], "challenged")
            print(f"[{platform}] CHALLENGE — pausing account", flush=True)
        elif "rate" in msg or "wait a few minutes" in msg:
            print(f"[{platform}] rate-limited, backing off {RATE_LIMIT_BACKOFF_SECONDS}s", flush=True)
            await asyncio.sleep(RATE_LIMIT_BACKOFF_SECONDS)

    await mark_target(target["id"], "done" if success else "failed")
    await log_engagement(
        account["id"], platform, target["action"],
        handle, target["targetPostId"],
        success, error,
    )


async def _run_platform(platform: str) -> None:
    """One sweep through one platform's queue, respecting caps + waking hours."""
    if not in_waking_hours():
        return

    account = await get_account(platform)
    if not account or not account["botCookies"] or account["botStatus"] != "healthy":
        return

    # 50% of sweeps do absolutely nothing — break the predictable cadence
    if should_skip_this_sweep():
        print(f"  [{platform}] lurk-only this sweep", flush=True)
        return

    cookies = decrypt_token(account["botCookies"])
    p = await pool()
    n_actions = actions_this_cycle()

    for _ in range(n_actions):
        target = await fetch_queued_target(platform)
        if not target:
            break

        count = await daily_count(p, account["id"], target["action"])
        if not under_cap(platform, target["action"], count):
            await mark_target(target["id"], "skipped")
            continue

        # Small "browsing" pause before the action (human reads/scrolls first)
        await micro_jitter()
        try:
            await _process_target(platform, target, account, cookies)
        except Exception:
            traceback.print_exc()
        # Long inter-action delay (5-30 min) — biggest human-likeness lever
        await jitter()


async def engagement_loop() -> None:
    """Sweep engagement queue every 30 min, respect kill switch."""
    while True:
        if os.environ.get("SOCIAL_BOT_ENABLED", "true").lower() == "false":
            print(f"[{datetime.now(timezone.utc).isoformat()}] engagement disabled, sleeping 5min", flush=True)
            await asyncio.sleep(300)
            continue

        print(f"[{datetime.now(timezone.utc).isoformat()}] engagement sweep start", flush=True)
        for platform in PLATFORMS:
            try:
                await _run_platform(platform)
            except Exception:
                traceback.print_exc()
        # Variable inter-sweep delay (25-95 min) — not exact 30 min ticks
        sleep_for = next_sweep_delay_seconds()
        print(f"  next sweep in {sleep_for // 60} min", flush=True)
        await asyncio.sleep(sleep_for)


async def cron_loop() -> None:
    """Every 60s, fire any scheduled HTTP cron jobs whose pattern matches NOW.
    Avoids needing 6 separate Railway cron services."""
    from crons import fire_due_jobs
    while True:
        try:
            fire_due_jobs()
        except Exception:
            traceback.print_exc()
        await asyncio.sleep(60)


async def main() -> None:
    await asyncio.gather(engagement_loop(), cron_loop())


if __name__ == "__main__":
    # Kill-switch at startup is handled before imports (top of file).
    asyncio.run(main())
