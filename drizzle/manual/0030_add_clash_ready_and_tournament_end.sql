-- Ready gate for 1V1 matches + end time for scheduled private tournaments.
-- Safe to run repeatedly.

ALTER TABLE "clash_1v1_entries"
  ADD COLUMN IF NOT EXISTS "ready_at" timestamp;

ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "end_date" timestamp;
