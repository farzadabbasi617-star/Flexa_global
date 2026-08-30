-- Standalone paid queue for Clash Royale 1V1 Telegram matchmaking.
-- Separate from `registrations` because 1V1 is not a room/bracket signup and
-- a player may buy a fresh entry for a new duel after a previous one completes.

DO $$ BEGIN
  CREATE TYPE clash_1v1_entry_status AS ENUM ('waiting_qr', 'queued', 'matched', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS clash_1v1_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  user_id uuid NOT NULL REFERENCES users(id),
  player_id uuid NOT NULL REFERENCES players(id),
  telegram_id varchar(32) NOT NULL,
  status clash_1v1_entry_status NOT NULL DEFAULT 'waiting_qr',
  entry_fee_rial numeric(20,0) NOT NULL DEFAULT 500000,
  prize_rial numeric(20,0) NOT NULL DEFAULT 800000,
  invite_link text,
  qr_file_id varchar(255),
  submitted_at timestamp,
  matched_match_id uuid REFERENCES matches(id),
  matched_at timestamp,
  completed_at timestamp,
  cancelled_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS clash_1v1_entries_user_status_idx ON clash_1v1_entries(user_id, status);
CREATE INDEX IF NOT EXISTS clash_1v1_entries_status_submitted_idx ON clash_1v1_entries(status, submitted_at);
CREATE INDEX IF NOT EXISTS clash_1v1_entries_match_idx ON clash_1v1_entries(matched_match_id);
CREATE INDEX IF NOT EXISTS clash_1v1_entries_telegram_idx ON clash_1v1_entries(telegram_id);
