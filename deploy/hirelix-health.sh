#!/usr/bin/env bash
# Read-only checks. A failed oneshot remains visible in systemctl/journalctl.
set -euo pipefail
systemctl is-active --quiet postgresql hirelix-scheduler
systemctl is-enabled --quiet hirelix-scheduler
if grep -Eq "^PRIVATE_WORKSPACE_WORKER_ENABLED=(false|\"false\"|'false')[[:space:]]*(#.*)?$" /etc/hirelix.env; then
  echo 'Hirelix private workspace worker is disabled' >&2
  exit 1
fi
stalled=$(runuser -u postgres -- psql -X -A -t -v ON_ERROR_STOP=1 -d hirelix -c "
  SET statement_timeout='10s';
  SELECT count(*) FROM hirelix_private_jobs
  WHERE (status='queued' AND updated_at < now()-interval '10 minutes')
     OR (status='running' AND lease_until < now()-interval '3 minutes');" | tail -1)
if [[ "$stalled" != 0 ]]; then
  printf 'Hirelix queue needs attention: %s stalled private tasks\n' "$stalled" >&2
  exit 1
fi
if ! find /var/backups/hirelix -maxdepth 1 -type f -name 'daily-*.dump' -mmin -1560 -size +0c -print -quit | grep -q .; then
  echo 'Hirelix has no successful daily database backup within 26 hours' >&2
  exit 1
fi
echo 'Hirelix service, PostgreSQL, private queue and daily backup checks passed'
