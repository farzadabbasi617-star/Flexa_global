#!/usr/bin/env bash
#
# Gament Telegram Migration Runner
# Applies the manual Telegram-related SQL migrations in the correct order.
# Usage:
#   chmod +x apply-telegram-migrations.sh
#   DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" ./apply-telegram-migrations.sh
#

set -euo pipefail

MIGRATIONS_DIR="drizzle/manual"
MIGRATIONS=(
  "0002_add_telegram_pre_registrations.sql"
  "0003_add_telegram_bot_sessions.sql"
  "0004_add_telegram_account_linking.sql"
  "0005_add_telegram_growth_and_notifications.sql"
  "0006_add_telegram_marketing_and_waitlist.sql"
)

# ─────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────

if ! command -v psql &> /dev/null; then
  echo "❌ Error: psql is not installed or not in PATH."
  echo "   Install PostgreSQL client tools first:"
  echo "     macOS:   brew install libpq"
  echo "     Ubuntu:  sudo apt install postgresql-client"
  echo "     Arch:    sudo pacman -S postgresql-libs"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ Error: DATABASE_URL is not set."
  echo "   Example:"
  echo "     DATABASE_URL=\"postgresql://user:password@host/database?sslmode=require\" ./apply-telegram-migrations.sh"
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌ Error: Migration directory not found: $MIGRATIONS_DIR"
  echo "   Make sure you run this script from the project root."
  exit 1
fi

# ─────────────────────────────────────────────────────────────
# Apply migrations
# ─────────────────────────────────────────────────────────────

echo "🚀 Applying Gament Telegram migrations..."
echo "   Database: ${DATABASE_URL%%@*}@..."
echo "   Directory: $MIGRATIONS_DIR"
echo ""

for migration in "${MIGRATIONS[@]}"; do
  file="$MIGRATIONS_DIR/$migration"

  if [ ! -f "$file" ]; then
    echo "❌ Error: Migration file not found: $file"
    exit 1
  fi

  echo "▶️  Running $migration ..."

  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" > /tmp/gament-migration-$migration.log 2>&1; then
    echo "   ✅ $migration applied successfully."
  else
    echo "   ❌ $migration failed. See log below:"
    cat "/tmp/gament-migration-$migration.log"
    exit 1
  fi

echo ""
done

# ─────────────────────────────────────────────────────────────
# Verify tables
# ─────────────────────────────────────────────────────────────

echo "🔍 Verifying Telegram tables..."
echo ""

verify_output=$(psql "$DATABASE_URL" -t -A -c "
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'telegram_accounts',
    'telegram_bot_sessions',
    'telegram_campaign_events',
    'telegram_channel_posts',
    'telegram_link_codes',
    'telegram_pre_registrations',
    'telegram_referrals',
    'telegram_sent_notifications',
    'coupons',
    'coupon_redemptions',
    'tournament_waitlist'
  )
ORDER BY table_name;
" 2>/dev/null)

expected_count=11
actual_count=$(echo "$verify_output" | grep -v '^$' | wc -l | tr -d ' ')

if [ "$actual_count" -eq "$expected_count" ]; then
  echo "✅ All $expected_count expected Telegram tables are present."
else
  echo "⚠️  Warning: Only $actual_count of $expected_count expected tables were found."
  echo "   Found tables:"
  echo "$verify_output" | sed 's/^/   - /'
  exit 1
fi

echo ""
echo "🎉 Telegram migrations applied and verified successfully!"
