#!/bin/sh
# Nightly Postgres backup for the HamPath stack (the `backup` service in docker-compose.prod.yml).
# Writes /backups/hampath-YYYYMMDD-HHMMSS.sql.gz, deletes ones older than BACKUP_KEEP_DAYS, and
# pings BACKUP_PUSH_URL (an Uptime Kuma push monitor) after a good dump, so a missed backup alerts.
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"

backup() {
  file="/backups/hampath-$(date +%Y%m%d-%H%M%S).sql.gz"
  if pg_dump --no-owner --clean --if-exists | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    find /backups -name 'hampath-*.sql.gz' -mtime "+$KEEP" -delete
    echo "backup ok: $file ($(du -h "$file" | cut -f1))"
    if [ -n "${BACKUP_PUSH_URL:-}" ]; then wget -qO /dev/null "$BACKUP_PUSH_URL" || true; fi
  else
    rm -f "$file.tmp"
    echo "backup FAILED" >&2
  fi
}

# One now (so a fresh deploy has a backup), then every night at about 03:00 server time.
backup
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%Y-%m-%d) 03:00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  backup
done
