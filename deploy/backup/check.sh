#!/bin/sh
# Restore check: proves the newest backup can actually be restored, without touching the live
# data. Run ON THE VPS (weekly cron, Sunday 03:45):
#   45 3 * * 0 sh $HOME/myrooms/app/deploy/backup/check.sh >> $HOME/backups/backup.log 2>&1
#
# Restores the newest dump (or the one given as $1) into a scratch database
# "myrooms_restore_check" in the same Postgres, compares row counts with the .counts file
# written at backup time, then drops the scratch database. Exit code 0 = good backup.
set -eu

SUPABASE_DIR="${SUPABASE_DIR:-$HOME/myrooms/supabase}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
SCRATCH=myrooms_restore_check

HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib.sh"

DUMP="${1:-$(ls -1t "$BACKUP_DIR"/myrooms-*.dump 2>/dev/null | head -n 1)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || fail "no backup found in $BACKUP_DIR"
COUNTS="${DUMP%.dump}.counts"
[ -f "$COUNTS" ] || fail "$COUNTS is missing (made by backup.sh next to the dump)"
log "restore check of $DUMP"

cleanup() { db_psql postgres -q -c "drop database if exists $SCRATCH with (force)" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
db_psql postgres -q -c "create database $SCRATCH"

# Supabase's own extensions and settings (pg_net, pgsodium, event triggers…) can't always be
# recreated in a second database; those errors are expected. What matters is the data,
# which the row counts below check.
docker exec -i -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
  pg_restore -h 127.0.0.1 -U supabase_admin -d "$SCRATCH" --no-owner --no-privileges \
  < "$DUMP" > /dev/null 2>"$BACKUP_DIR/restore-check.err" || true
log "pg_restore finished with $(grep -c 'error:' "$BACKUP_DIR/restore-check.err" || true) error lines (see restore-check.err)"

RESTORED="$(db_psql "$SCRATCH" -At -c "$(count_query)" 2>/dev/null)" ||
  fail "restored database is missing MyRooms tables: the backup is NOT usable"

BAD=0
# The counts were taken just before the dump: allow a few rows written in between.
printf '%s\n' "$RESTORED" | while IFS='|' read -r table rows; do
  want="$(grep "^$table|" "$COUNTS" | cut -d'|' -f2)"
  diff=$((rows - ${want:-0}))
  [ "$diff" -lt 0 ] && diff=$((-diff))
  allowed=$(( ${want:-0} / 100 + 5 ))
  if [ "$diff" -gt "$allowed" ]; then
    log "MISMATCH $table: backup had $want rows, restore has $rows"
    echo bad
  else
    log "ok $table: $rows rows"
  fi
done > "$BACKUP_DIR/restore-check.out"
grep -v '^bad$' "$BACKUP_DIR/restore-check.out" || true
grep -q '^bad$' "$BACKUP_DIR/restore-check.out" && BAD=1

[ "$BAD" -eq 0 ] || fail "restore check FAILED for $DUMP"
log "restore check PASSED for $DUMP"
