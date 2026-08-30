-- Clash Royale 1V1: random/friend opponents, free/paid stakes and negotiated modes.

ALTER TABLE clash_1v1_entries
  ADD COLUMN IF NOT EXISTS opponent_type varchar(16) NOT NULL DEFAULT 'random',
  ADD COLUMN IF NOT EXISTS stake_mode varchar(16) NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS game_mode varchar(32) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS challenge_id uuid;

DO $$ BEGIN
  ALTER TABLE clash_1v1_entries
    ADD CONSTRAINT clash_1v1_entries_opponent_type_check
    CHECK (opponent_type IN ('random', 'friend'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE clash_1v1_entries
    ADD CONSTRAINT clash_1v1_entries_stake_mode_check
    CHECK (stake_mode IN ('free', 'paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE clash_1v1_entries
    ADD CONSTRAINT clash_1v1_entries_game_mode_check
    CHECK (game_mode IN ('normal', 'draft', 'triple_draft', 'sudden_death'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS clash_1v1_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash varchar(64) NOT NULL UNIQUE,
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  challenger_user_id uuid NOT NULL REFERENCES users(id),
  challenger_telegram_id varchar(32) NOT NULL,
  opponent_user_id uuid REFERENCES users(id),
  opponent_telegram_id varchar(32),
  proposed_by_user_id uuid NOT NULL REFERENCES users(id),
  stake_mode varchar(16) NOT NULL CHECK (stake_mode IN ('free', 'paid')),
  game_mode varchar(32) NOT NULL CHECK (game_mode IN ('normal', 'draft', 'triple_draft', 'sudden_death')),
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'countered', 'accepted', 'rejected', 'expired', 'cancelled')),
  proposal_version integer NOT NULL DEFAULT 1,
  match_id uuid REFERENCES matches(id),
  expires_at timestamp NOT NULL,
  accepted_at timestamp,
  cancelled_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  metadata jsonb
);

DO $$ BEGIN
  ALTER TABLE clash_1v1_entries
    ADD CONSTRAINT clash_1v1_entries_challenge_fk
    FOREIGN KEY (challenge_id) REFERENCES clash_1v1_challenges(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS clash_1v1_entries_queue_mode_idx
  ON clash_1v1_entries(status, opponent_type, stake_mode, game_mode, submitted_at);
CREATE INDEX IF NOT EXISTS clash_1v1_entries_challenge_idx
  ON clash_1v1_entries(challenge_id);
CREATE INDEX IF NOT EXISTS clash_1v1_challenges_challenger_status_idx
  ON clash_1v1_challenges(challenger_user_id, status);
CREATE INDEX IF NOT EXISTS clash_1v1_challenges_opponent_status_idx
  ON clash_1v1_challenges(opponent_user_id, status);
CREATE INDEX IF NOT EXISTS clash_1v1_challenges_expires_idx
  ON clash_1v1_challenges(status, expires_at);
CREATE INDEX IF NOT EXISTS clash_1v1_challenges_match_idx
  ON clash_1v1_challenges(match_id);
