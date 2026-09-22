#!/bin/sh
set -eu
pgbin=/Applications/Postgres.app/Contents/Versions/17/bin
scratch_dir=$(mktemp -d /private/tmp/pennylime-security-db.XXXXXX)
trap '"$pgbin/pg_ctl" -D "$scratch_dir/data" stop -m fast >/dev/null 2>&1 || true' EXIT
"$pgbin/initdb" -D "$scratch_dir/data" --auth=trust --username=postgres --no-locale > "$scratch_dir/init.log"
"$pgbin/pg_ctl" -D "$scratch_dir/data" -l "$scratch_dir/server.log" -o "-h 127.0.0.1 -p 55439 -k $scratch_dir" start
"$pgbin/psql" -h 127.0.0.1 -p 55439 -U postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE "AdminUser" ("id" TEXT PRIMARY KEY, "email" TEXT UNIQUE NOT NULL);
CREATE TABLE "Application" ("id" TEXT PRIMARY KEY);
INSERT INTO "AdminUser" VALUES ('test-admin','test@example.invalid');
SQL
"$pgbin/psql" -h 127.0.0.1 -p 55439 -U postgres -v ON_ERROR_STOP=1 -f prisma/migrations/20260918160000_security_controls/migration.sql
"$pgbin/psql" -h 127.0.0.1 -p 55439 -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
IF (SELECT "mfaVersion" FROM "AdminUser" WHERE id = 'test-admin') <> 0 THEN RAISE EXCEPTION 'Existing account default failed'; END IF;
END $$;
INSERT INTO "AdminPasskey" (id,"adminId","publicKey",transports) VALUES ('key','test-admin','\x01',ARRAY['internal']);
INSERT INTO "AdminMfaChallenge" (id,"adminId",challenge,purpose,"expiresAt") VALUES ('challenge','test-admin','test','authenticate',NOW());
DELETE FROM "AdminUser" WHERE id='test-admin';
DO $$ BEGIN
IF EXISTS (SELECT FROM "AdminPasskey") OR EXISTS (SELECT FROM "AdminMfaChallenge") THEN RAISE EXCEPTION 'Credential cascade failed'; END IF;
END $$;
SQL
printf 'Migration smoke test passed against isolated PostgreSQL 17.\n'
