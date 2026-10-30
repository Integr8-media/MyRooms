# Shared by backup.sh, check.sh and restore.sh (sourced, not run).
# Needs SUPABASE_DIR and DB_CONTAINER set by the caller.

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

[ -f "$SUPABASE_DIR/.env" ] || fail "$SUPABASE_DIR/.env not found (set SUPABASE_DIR)"
# The Supabase containers share POSTGRES_PASSWORD for their internal roles, supabase_admin
# included (the superuser: needed to dump and restore the auth and storage schemas).
PGPASS="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$SUPABASE_DIR/.env" | tail -n 1 | tr -d '"'"'"'')"
[ -n "$PGPASS" ] || fail "POSTGRES_PASSWORD missing in $SUPABASE_DIR/.env"
docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || fail "container $DB_CONTAINER is not running"

# psql inside the database container: db_psql <database> [psql options...]
db_psql() {
  _db="$1"
  shift
  docker exec -i -e PGPASSWORD="$PGPASS" "$DB_CONTAINER" \
    psql -h 127.0.0.1 -U supabase_admin -d "$_db" -v ON_ERROR_STOP=1 "$@"
}

# The tables whose rows are compared after a test restore: every MyRooms table plus the
# accounts. Prints "table|rows" lines.
COUNT_TABLES="auth.users public.organizations public.branches public.memberships
public.member_branches public.invitations public.station_types public.stations
public.rate_rules public.packages public.sessions public.session_segments public.bills
public.payments public.customers public.products public.session_items
public.stock_movements public.expenses public.audit_log"

count_query() {
  _sql=""
  for t in $COUNT_TABLES; do
    [ -n "$_sql" ] && _sql="$_sql union all "
    _sql="${_sql}select '$t', count(*) from $t"
  done
  printf '%s order by 1' "$_sql"
}
