#!/usr/bin/env bash
# Recreates the local test database with the same migration history as
# production (base schema + supabase/migrations in order) and seeds data that
# must survive the NALA migration untouched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DB="${NALA_TEST_DB:-nala_test}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -c "alter user postgres password 'postgres'" >/dev/null
"${PSQL[@]}" -c "drop database if exists ${DB} with (force)" -c "create database ${DB}"
"${PSQL[@]}" -d "$DB" -f "$ROOT/tests/nala/support/bootstrap.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase-migration.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  case "$f" in *nala_fiscal_pipeline*) continue;; esac
  "${PSQL[@]}" -d "$DB" -f "$f"
done
# Pre-existing data (before NALA's migration) that must be preserved.
"${PSQL[@]}" -d "$DB" -f "$ROOT/tests/nala/support/seed_existing.sql"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/202609300001_nala_fiscal_pipeline.sql"
# Idempotency: applying the migration twice must not fail.
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/migrations/202609300001_nala_fiscal_pipeline.sql"
"${PSQL[@]}" -d "$DB" -c "grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role; grant execute on all functions in schema public to service_role;"
echo "db ${DB} listo"
