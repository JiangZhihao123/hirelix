# Hirelix logging

Hirelix uses `pino` through `src/lib/logger.ts` for structured server logs.
The logger always writes JSON Lines to stdout, so `journalctl -u hirelix-scheduler`
continues to work. On VPS services, enable file logging explicitly so each
runtime record also lands in a formal log file.

## Enable scheduler file logs

Set these values in `/etc/hirelix.env` on `us-2`:

```bash
LOG_LEVEL=info
LOG_FILE_ENABLED=true
LOG_FILE_PATH=/var/log/hirelix/scheduler.log
```

Create the log directory before restarting the scheduler:

```bash
sudo install -d -m 0750 -o root -g adm /var/log/hirelix
```

Restart the scheduler after changing `/etc/hirelix.env`:

```bash
sudo systemctl restart hirelix-scheduler
```

## Daily rotation

Install the repository logrotate config:

```bash
sudo cp deploy/logrotate/hirelix-scheduler /etc/logrotate.d/hirelix-scheduler
sudo logrotate -d /etc/logrotate.d/hirelix-scheduler
```

The config rotates `/var/log/hirelix/*.log` daily, keeps 14 archives, compresses
old logs, and uses `copytruncate` because the Node process keeps the log file
descriptor open.

To force a rotation test:

```bash
sudo logrotate -f /etc/logrotate.d/hirelix-scheduler
ls -lah /var/log/hirelix
```

## Reading logs

Live scheduler log:

```bash
sudo tail -f /var/log/hirelix/scheduler.log
```

Filter one search:

```bash
sudo jq 'select(.search_id == "SEARCH_ID")' /var/log/hirelix/scheduler.log
```

Filter one event type:

```bash
sudo jq 'select(.event == "search_timing")' /var/log/hirelix/scheduler.log
```

Common fields:

- `time`: ISO timestamp emitted by pino.
- `level`: pino numeric level. `30` is info, `40` is warn, `50` is error.
- `service`: always `hirelix`.
- `env`: `NODE_ENV`.
- `component`: stable module name, for example `search_pipeline`,
  `brightdata`, `search_persistence`, or `search_job_scheduler`.
- `event`: stable event name for pipeline and worker milestones.
- `search_id`, `job_id`, `candidate_id`, `snapshot_id`: correlation keys.

For emergency checks, journald remains available:

```bash
sudo journalctl -u hirelix-scheduler -f
```
