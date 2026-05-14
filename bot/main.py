import asyncio
import os
import sys
from datetime import datetime, timezone


async def main():
    if os.environ.get("SOCIAL_BOT_ENABLED", "true").lower() == "false":
        print("Bot disabled via SOCIAL_BOT_ENABLED=false", flush=True)
        sys.exit(0)
    print(f"[{datetime.now(timezone.utc).isoformat()}] Bot starting (stub)...", flush=True)
    while True:
        print(f"[{datetime.now(timezone.utc).isoformat()}] tick", flush=True)
        await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(main())
