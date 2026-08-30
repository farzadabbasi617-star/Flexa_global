-- Attendance/no-show policy for paid multiplayer tournaments.
-- Safe to run repeatedly.

ALTER TABLE "registrations"
  ADD COLUMN IF NOT EXISTS "attendance_status" varchar(20) NOT NULL DEFAULT 'registered',
  ADD COLUMN IF NOT EXISTS "no_show_at" timestamp,
  ADD COLUMN IF NOT EXISTS "cancellation_policy_accepted_at" timestamp;

CREATE INDEX IF NOT EXISTS "registrations_tournament_attendance_idx"
  ON "registrations" ("tournament_id", "attendance_status");
