-- Manual, idempotent migration: add the rate_limits table.
--
-- Safe to run on an existing database (uses IF NOT EXISTS), and only adds the
-- new table introduced for the distributed rate limiter. Run it once against
-- your database, e.g.:
--
--   psql "$DATABASE_URL" -f drizzle/manual/0001_add_rate_limits.sql
--
-- (Or paste it into the Neon SQL editor.)

CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key"      varchar(191) PRIMARY KEY NOT NULL,
  "count"    integer      NOT NULL DEFAULT 0,
  "reset_at" timestamp    NOT NULL
);

CREATE INDEX IF NOT EXISTS "rate_limits_reset_at_idx"
  ON "rate_limits" USING btree ("reset_at");
