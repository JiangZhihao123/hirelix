#!/bin/bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

echo "Running Supabase migration..."
/opt/homebrew/opt/libpq/bin/psql "postgresql://postgres:jiangzhihao123@db.orftlxqgxsezreyzsnot.supabase.co:5432/postgres" -f supabase/full_migration.sql

if [ $? -eq 0 ]; then
  echo "✅ Migration successful!"
else
  echo "❌ Migration failed. Please run manually in Supabase Dashboard."
fi
