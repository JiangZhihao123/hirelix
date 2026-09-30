#!/usr/bin/env bash
# Run as root on us-2; use the local PostgreSQL socket, never a public password.
set -euo pipefail
umask 077
backup_dir=/var/backups/hirelix
install -d -m 700 "$backup_dir"
backup_file="$backup_dir/daily-$(date -u +%Y%m%dT%H%M%SZ).dump"
trap 'rm -f "$backup_file.partial"' EXIT
runuser -u postgres -- pg_dump --format=custom --dbname=hirelix > "$backup_file.partial"
pg_restore --list "$backup_file.partial" >/dev/null
test -s "$backup_file.partial"
mv "$backup_file.partial" "$backup_file"
# Only rotate this script's daily files; preserve manual release snapshots.
find "$backup_dir" -maxdepth 1 -type f -name 'daily-*.dump' -mtime +14 -delete
printf 'Hirelix database backup complete: %s (%s bytes)\n' "$backup_file" "$(stat -c %s "$backup_file")"
