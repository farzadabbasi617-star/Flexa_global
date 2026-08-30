#!/usr/bin/env bash
#
# Gament — apply every manual SQL migration, in order.
#
# The project never adopted a migration-history table (`drizzle-kit push` was
# used early on), so `drizzle/manual/*.sql` are hand-written, **idempotent**
# files. Every one of them uses IF NOT EXISTS / DO $$ ... EXCEPTION guards, so
# re-running the whole directory against an existing database is safe and is
# in fact the intended way to bring any database up to date.
#
# This replaces the hand-maintained list of psql commands in README.md, which
# had drifted badly (16 files documented out of 40 that exist).
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host/db?sslmode=verify-full" \
#     ./scripts/apply-migrations.sh
#
# Options:
#   --dry-run   List the migrations that would run, then exit.
#   --from NNNN Skip files with a numeric prefix lower than NNNN.
#
set -euo pipefail

MIGRATIONS_DIR="drizzle/manual"
DRY_RUN=false
FROM=""

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --from)    FROM="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# --dry-run only lists files, so it does not need a database client.
if [ "$DRY_RUN" = false ] && ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed or not in PATH." >&2
  echo "  macOS:  brew install libpq" >&2
  echo "  Ubuntu: sudo apt install postgresql-client" >&2
  exit 1
fi

if [ "$DRY_RUN" = false ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set." >&2
  echo 'Example: DATABASE_URL="postgresql://user:pass@host/db?sslmode=verify-full" ./scripts/apply-migrations.sh' >&2
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Migration directory not found: $MIGRATIONS_DIR" >&2
  echo "Run this script from the project root." >&2
  exit 1
fi

# Lexical order is the intended order. The numeric prefixes are zero-padded,
# and where two files share a prefix (0023_add_… before 0023_harden_…) the
# alphabetical tie-break already puts them in the correct dependency order.
mapfile -t MIGRATIONS < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -print | sort)

if [ ${#MIGRATIONS[@]} -eq 0 ]; then
  echo "No .sql files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

if [ -n "$FROM" ]; then
  FILTERED=()
  for file in "${MIGRATIONS[@]}"; do
    prefix="$(basename "$file" | cut -d_ -f1)"
    if [ "$prefix" \> "$FROM" ] || [ "$prefix" = "$FROM" ]; then
      FILTERED+=("$file")
    fi
  done
  MIGRATIONS=("${FILTERED[@]}")
fi

echo "Gament migrations"
echo "  directory: $MIGRATIONS_DIR"
echo "  files:     ${#MIGRATIONS[@]}"
[ -n "${DATABASE_URL:-}" ] && echo "  database:  ${DATABASE_URL%%@*}@..."
echo ""

if [ "$DRY_RUN" = true ]; then
  for file in "${MIGRATIONS[@]}"; do
    echo "  would apply  $(basename "$file")"
  done
  echo ""
  echo "Dry run only. Nothing was applied."
  exit 0
fi

failed=0
for file in "${MIGRATIONS[@]}"; do
  name="$(basename "$file")"
  log="/tmp/gament-migration-${name}.log"

  printf '  %-58s ' "$name"

  # CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so these
  # files are applied statement-by-statement (psql's default) rather than
  # wrapped in a single transaction. Each file is individually idempotent.
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$file" >"$log" 2>&1; then
    echo "ok"
  else
    echo "FAILED"
    echo ""
    echo "--- $name ---"
    tail -30 "$log"
    echo "-----------------------------------"
    failed=1
    break
  fi
done

echo ""
if [ "$failed" -ne 0 ]; then
  echo "Migration run aborted. Fix the error above and re-run — already-applied"
  echo "files are idempotent and will simply be skipped by their IF NOT EXISTS"
  echo "guards."
  exit 1
fi

echo "All ${#MIGRATIONS[@]} migrations applied successfully."
