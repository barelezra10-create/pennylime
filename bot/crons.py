"""Internal cron firing — keeps Bar from having to set up 6 Railway crons.

Each tick (60s) checks all configured schedules. Anything whose schedule
hits this minute gets fired (POST to the matching pennylime endpoint).

Avoids node-cron / external scheduler — we just compare UTC time fields
to a cron-like tuple per job.
"""
import os
import sys
from datetime import datetime, timezone

import httpx


PENNYLIME_URL = os.environ.get("PENNYLIME_URL", "https://pennylime.com")
CRON_SECRET = os.environ.get("CRON_SECRET")

# (minute, hour, dayOfWeek (0=Sun, 1=Mon, ..., 6=Sat, None=any), endpoint, label)
# None means "match any"
SCHEDULES = [
    # Every 15 min (any hour, any day): comment replies
    (0,  None, None, "/api/cron/social-comments", "comments"),
    (15, None, None, "/api/cron/social-comments", "comments"),
    (30, None, None, "/api/cron/social-comments", "comments"),
    (45, None, None, "/api/cron/social-comments", "comments"),
    # Daily 13:00 UTC: pull RSS
    (0, 13, None, "/api/cron/social-rss", "rss"),
    # Daily 14:00 UTC: build engagement target queue
    (0, 14, None, "/api/cron/social-targets", "targets"),
    # Daily 15:00 UTC: publish today's planned post
    (0, 15, None, "/api/cron/social-generate", "generate"),
    # Mon/Wed/Fri 16:00 UTC: publish a reel
    (0, 16, 1, "/api/cron/social-reel", "reel"),
    (0, 16, 3, "/api/cron/social-reel", "reel"),
    (0, 16, 5, "/api/cron/social-reel", "reel"),
    # Daily 06:00 UTC: token health check
    (0, 6, None, "/api/cron/social-health", "health"),
]


def _last_fired_minute() -> int:
    """Track per-process to avoid double-firing within the same minute."""
    return getattr(_last_fired_minute, "_v", -1)


def _set_last_fired_minute(v: int) -> None:
    _last_fired_minute._v = v  # type: ignore[attr-defined]


def fire_due_jobs() -> list[tuple[str, int, str]]:
    """Check all schedules; fire any whose pattern matches NOW. Returns
    a list of (label, status_code, response_snippet) tuples for logging."""
    if not CRON_SECRET:
        print("[crons] CRON_SECRET not set, skipping all cron fires", flush=True)
        return []

    now = datetime.now(timezone.utc)
    # Don't fire twice in the same minute
    if now.minute == _last_fired_minute():
        return []

    results = []
    for minute, hour, dow, endpoint, label in SCHEDULES:
        if now.minute != minute:
            continue
        if hour is not None and now.hour != hour:
            continue
        if dow is not None:
            # SCHEDULES dow: Sun=0..Sat=6.  Python weekday: Mon=0..Sun=6.
            # Convert SCHEDULES dow -> python weekday
            py_dow = (dow + 6) % 7
            if now.weekday() != py_dow:
                continue
        url = PENNYLIME_URL + endpoint
        try:
            r = httpx.post(
                url,
                headers={"Authorization": f"Bearer {CRON_SECRET}"},
                timeout=300,
            )
            snippet = r.text[:120].replace("\n", " ")
            results.append((label, r.status_code, snippet))
            print(f"[crons] {label} -> {r.status_code} {snippet}", flush=True)
        except Exception as e:
            msg = f"{type(e).__name__}: {str(e)[:80]}"
            results.append((label, -1, msg))
            print(f"[crons] {label} -> ERROR {msg}", flush=True)
    if results:
        _set_last_fired_minute(now.minute)
    return results


if __name__ == "__main__":
    # Standalone smoke test: print which schedules WOULD fire now without firing them.
    now = datetime.now(timezone.utc)
    print(f"now={now.isoformat()} weekday(py)={now.weekday()}")
    for minute, hour, dow, endpoint, label in SCHEDULES:
        m = "*" if minute is None else minute
        h = "*" if hour is None else hour
        d = "*" if dow is None else dow
        print(f"  {m:>2} {h:>2} {d:>1}  {endpoint} ({label})")
