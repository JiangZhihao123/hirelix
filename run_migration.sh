#!/bin/bash
set -euo pipefail

export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

DEFAULT_SUPABASE_DB_URL="postgresql://postgres.orftlxqgxsezreyzsnot@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
SUPABASE_DB_URL="${SUPABASE_DB_URL:-$DEFAULT_SUPABASE_DB_URL}"
SUPABASE_DB_PASSWORD="${SUPABASE_DB_PASSWORD:-jiangzhihao123}"

echo "Running Supabase migration..."
PGPASSWORD="$SUPABASE_DB_PASSWORD" /opt/homebrew/opt/libpq/bin/psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/full_migration.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration successful!"
else
  echo "❌ Migration failed. Please run manually in Supabase Dashboard."
fi
