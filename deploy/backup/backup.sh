#!/bin/sh
# Nightly backup of the MyRooms database (self-hosted Supabase). Run ON THE VPS:
#   sh ~/myrooms/app/deploy/backup/backup.sh
# Cron (03:15 every night):
#   15 3 * * * sh $HOME/myrooms/app/deploy/backup/backup.sh >> $HOME/backups/backup.log 2>&1
#
# Writes $BACKUP_DIR/myrooms-<date>.dump (pg_dump custom format: every schema, including
# auth users) and myrooms-<date>.counts (row counts, used by check.sh). Keeps KEEP_DAYS days.
# If BACKUP_REMOTE is set (an rclone remote, e.g. "oci-crypt:myrooms-backups"), each dump is
# also copied there. The dumps hold customer names and phones: use an encrypted remote.
#
# PowerSync's own database is not backed up: it is rebuilt from Supabase (see README).
set -eu

SUPABASE_DIR="${SUPABASE_DIR:-$HOME/myrooms/supabase}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib.sh"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y-%m-%dT%H%MZ)"
DUMP="$BACKUP_DIR/myrooms-$STAMP.dump"
COUNTS="$BACKUP_DIR/myrooms-$STAMP.counts"

log "backup started → $DUMP"

# Row counts first (the dump follows a second later; check.sh allows for small differences).
db_psql postgres -At -c "$(count_query)" > "$COUNTS.tmp"

# Written to a temporary name, so a failed run never leaves a dump that looks complete.
docker exec -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
  pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -Fc --no-comments > "$DUMP.tmp"
mv "$DUMP.tmp" "$DUMP"
mv "$COUNTS.tmp" "$COUNTS"
chmod 600 "$DUMP" "$COUNTS"

SIZE="$(du -h "$DUMP" | cut -f1)"
log "backup done ($SIZE)"

if [ -n "$BACKUP_REMOTE" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$DUMP" "$BACKUP_REMOTE" && rclone copy "$COUNTS" "$BACKUP_REMOTE"
    log "copied to $BACKUP_REMOTE"
  else
    log "WARNING: BACKUP_REMOTE is set but rclone is not installed; no off-site copy"
  fi
fi

# Keep the last KEEP_DAYS days on the VPS (the remote keeps its own history).
find "$BACKUP_DIR" -maxdepth 1 -name 'myrooms-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'myrooms-*.counts' -mtime +"$KEEP_DAYS" -delete
log "kept the last $KEEP_DAYS days"
