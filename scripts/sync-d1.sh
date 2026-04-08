#!/bin/bash
# Sync local SQLite (dev.db) data to Cloudflare D1
# Usage: bash scripts/sync-d1.sh [--remote]
#
# By default, applies migrations and data to D1 --local (local wrangler miniflare).
# Pass --remote to push to the actual Cloudflare D1 database.

set -e

REMOTE_FLAG=""
if [[ "$1" == "--remote" ]]; then
  REMOTE_FLAG="--remote"
  echo "Syncing to REMOTE Cloudflare D1..."
else
  echo "Syncing to LOCAL D1 (miniflare)..."
fi

DB_NAME="pennylime-db"
DEV_DB="./dev.db"
DUMP_FILE="/tmp/pennylime-dump.sql"

# Step 1: Apply all Prisma migrations to D1
echo "Applying Prisma migrations to D1..."
for migration_dir in prisma/migrations/*/; do
  migration_sql="$migration_dir/migration.sql"
  if [[ -f "$migration_sql" ]]; then
    echo "  Applying: $migration_dir"
    npx wrangler d1 execute "$DB_NAME" $REMOTE_FLAG --file="$migration_sql"
  fi
done

# Step 2: Export data from local SQLite (excluding schema tables)
echo "Exporting data from $DEV_DB..."
sqlite3 "$DEV_DB" ".dump" | grep -v "^CREATE" | grep -v "^PRAGMA" | grep -v "^BEGIN TRANSACTION" | grep -v "^COMMIT" > "$DUMP_FILE"

# Step 3: Import data into D1
echo "Importing data into D1..."
npx wrangler d1 execute "$DB_NAME" $REMOTE_FLAG --file="$DUMP_FILE"

echo "Done! D1 sync complete."
