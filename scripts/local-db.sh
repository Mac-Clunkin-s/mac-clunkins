#!/usr/bin/env bash
# Local Postgres control for McCluckin's development and the RLS suite.
#
# Preferred path is `supabase start` (see README). This script is the fallback for
# environments without Docker: it runs a real PostgreSQL 17 + PostGIS cluster
# directly, then layers on a Supabase-compatible bootstrap (auth schema, auth.uid(),
# anon/authenticated/service_role roles) so the exact same migrations and the exact
# same RLS policies can be exercised locally.
#
# Usage: scripts/local-db.sh {up|down|reset|psql|status|apply}
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
PGDATA="${PGDATA:-$ROOT/.localdb/data}"
PGPORT="${PGPORT:-54329}"
# The socket lives outside the repo: a Unix socket path is capped at 107 bytes and a
# checkout path is easily longer than that on its own.
PGSOCK="${PGSOCK:-/tmp/mccluckins-pg-$(id -u)}"
PGDB="${PGDB:-postgres}"
LOGFILE="${LOGFILE:-$ROOT/.localdb/postgres.log}"

export PGHOST="$PGSOCK"
export PGPORT
export PGDATABASE="$PGDB"
export PGUSER="${PGUSER:-postgres}"

psql_q() { "$PGBIN/psql" -v ON_ERROR_STOP=1 -q "$@"; }

init() {
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    mkdir -p "$PGDATA" "$PGSOCK" "$(dirname "$LOGFILE")"
    chmod 700 "$PGDATA"
    "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 \
      --locale=C.UTF-8 >/dev/null
    {
      echo "unix_socket_directories = '$PGSOCK'"
      # Socket-only: nothing here needs TCP, and it keeps the cluster off any port a
      # sandbox or another service might already hold.
      echo "listen_addresses = ''"
      echo "port = $PGPORT"
      echo "timezone = 'Africa/Johannesburg'"
      echo "log_timezone = 'Africa/Johannesburg'"
      echo "log_min_messages = warning"
    } >> "$PGDATA/postgresql.conf"
  fi
}

start() {
  if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    echo "postgres already running on $PGSOCK:$PGPORT"
    return 0
  fi
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOGFILE" -w start >/dev/null
  echo "postgres up on $PGSOCK:$PGPORT"
}

stop() {
  if "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
    "$PGBIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null
    echo "postgres stopped"
  else
    echo "postgres not running"
  fi
}

# Applies the Supabase-compatible bootstrap, then every migration in order,
# then the seed. Idempotent only as a whole — use `reset` to re-run cleanly.
apply() {
  echo "== bootstrap (local-only Supabase shim)"
  psql_q -f "$ROOT/supabase/local/00_supabase_bootstrap.sql"
  echo "== migrations"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "   $(basename "$f")"
    psql_q -f "$f"
  done
  echo "== seed"
  psql_q -f "$ROOT/supabase/seed.sql"
  echo "== grants for the shimmed Supabase roles"
  psql_q -f "$ROOT/supabase/local/99_local_roles.sql"
  echo "done"
}

case "${1:-up}" in
  up)     init; start; apply ;;
  start)  init; start ;;
  down)   stop ;;
  status) "$PGBIN/pg_ctl" -D "$PGDATA" status || true ;;
  apply)  apply ;;
  psql)   shift; "$PGBIN/psql" "$@" ;;
  reset)
    stop || true
    rm -rf "$ROOT/.localdb"
    init; start; apply
    ;;
  *) echo "usage: $0 {up|start|down|reset|apply|status|psql}" >&2; exit 2 ;;
esac
