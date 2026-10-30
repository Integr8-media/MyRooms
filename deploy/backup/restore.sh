#!/bin/sh
# Disaster recovery: replace the live database with a backup. Run ON THE VPS:
#   sh ~/myrooms/app/deploy/backup/restore.sh ~/backups/myrooms-<date>.dump --yes
#
# Everything written to the server after that backup is LOST on the server. Devices that are
# offline with changes still waiting upload them when they reconnect; devices that already
# uploaded later changes lose them (they get the restored data). Prefer the newest backup,
# and run check.sh on it first.
#
# Steps: stop PowerSync → restore over the live database → restart Supabase → recreate
# PowerSync's storage so it copies everything again from the restored database.
set -eu

SUPABASE_DIR="${SUPABASE_DIR:-$HOME/myrooms/supabase}"
POWERSYNC_DIR="${POWERSYNC_DIR:-$HOME/myrooms/app/deploy/powersync}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"

DUMP="${1:-}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "usage: $0 <backup.dump> --yes" >&2; exit 1; }
[ "${2:-}" = "--yes" ] || {
  echo "This replaces ALL live data with $DUMP. Run again with --yes to go ahead." >&2
  exit 1
}

HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib.sh"

log "stopping PowerSync"
(cd "$POWERSYNC_DIR" && docker compose down)

# A safety copy of the current state, in case the wrong file was picked.
log "saving the current database first"
BACKUP_DIR="$BACKUP_DIR" KEEP_DAYS=36500 BACKUP_REMOTE="" sh "$HERE/backup.sh"

log "restoring $DUMP over the live database"
docker exec -i -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
  pg_restore -h 127.0.0.1 -U supabase_admin -d postgres --clean --if-exists \
  < "$DUMP" > /dev/null 2>"$BACKUP_DIR/restore.err" || true
log "pg_restore finished with $(grep -c 'error:' "$BACKUP_DIR/restore.err" || true) error lines (see restore.err)"
db_psql postgres -At -c "$(count_query)" | sed 's/^/  /'

log "restarting Supabase"
(cd "$SUPABASE_DIR" && docker compose restart)

# PowerSync's copy (and its replication position) belongs to the old data: start it fresh.
log "recreating PowerSync storage (it re-reads everything from the database)"
(cd "$POWERSYNC_DIR" && docker compose down -v && docker compose up -d)

log "done. Check the counts above, sign in on one device, and watch 'docker compose logs -f powersync'."
log "On a NEW server, first repeat deploy step 5 (powersync_role password): roles are not in the dump."
