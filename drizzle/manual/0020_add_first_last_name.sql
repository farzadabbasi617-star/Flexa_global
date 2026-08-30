-- Adds first_name / last_name to users. Idempotent (safe to run more than once).
--
-- Registration now collects the user's real first and last name as two
-- separate required fields instead of a single free-text "display name".
-- `display_name` is kept as-is (still NOT NULL, still used everywhere else
-- in the app) and is simply derived as "first_name last_name" at
-- registration time going forward.
--
-- Existing rows are backfilled by splitting the current display_name on the
-- first space so older accounts don't end up with empty first/last name
-- columns after this migration.

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name varchar(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name varchar(100);

UPDATE users
SET
  first_name = COALESCE(first_name, NULLIF(split_part(display_name, ' ', 1), '')),
  last_name = COALESCE(
    last_name,
    NULLIF(trim(substring(display_name FROM length(split_part(display_name, ' ', 1)) + 1)), '')
  )
WHERE first_name IS NULL OR last_name IS NULL;
