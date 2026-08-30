-- Gament COD Arena private-beta foundation.
-- Global + Garena Battle Royale rooms, secure credential reveal, shadow finance,
-- configurable Kill/Placement rewards, evidence, rank and generic affiliate source.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cod_mobile_region varchar(16) NOT NULL DEFAULT 'global';

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_cod_mobile_region_check
    CHECK (cod_mobile_region IN ('global', 'garena'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cod_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title varchar(180) NOT NULL,
  description text,
  region varchar(16) NOT NULL DEFAULT 'global',
  map varchar(40) NOT NULL DEFAULT 'isolated',
  team_mode varchar(16) NOT NULL DEFAULT 'solo',
  perspective varchar(8) NOT NULL DEFAULT 'tpp',
  status varchar(24) NOT NULL DEFAULT 'draft',
  is_published boolean NOT NULL DEFAULT false,
  capacity integer NOT NULL DEFAULT 40,
  entry_fee_rial numeric(20,0) NOT NULL DEFAULT 0,
  service_fee_rial numeric(20,0) NOT NULL DEFAULT 0,
  prize_budget_rial numeric(20,0) NOT NULL DEFAULT 0,
  referral_rate_bps integer NOT NULL DEFAULT 2000,
  reward_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  min_rank_points integer NOT NULL DEFAULT 0,
  rules text,
  rules_version varchar(40) NOT NULL DEFAULT 'cod-beta-1',
  requires_recording boolean NOT NULL DEFAULT true,
  room_code varchar(100),
  room_password varchar(100),
  official_join_url text,
  check_in_opens_at timestamp,
  check_in_closes_at timestamp,
  credentials_reveal_at timestamp,
  starts_at timestamp NOT NULL,
  ends_at timestamp,
  created_by_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cod_rooms_region_check CHECK (region IN ('global', 'garena')),
  CONSTRAINT cod_rooms_team_mode_check CHECK (team_mode IN ('solo', 'duo', 'squad')),
  CONSTRAINT cod_rooms_perspective_check CHECK (perspective IN ('fpp', 'tpp')),
  CONSTRAINT cod_rooms_capacity_check CHECK (capacity BETWEEN 2 AND 100),
  CONSTRAINT cod_rooms_money_check CHECK (
    entry_fee_rial >= 0 AND service_fee_rial >= 0 AND
    prize_budget_rial >= 0 AND service_fee_rial <= entry_fee_rial
  ),
  CONSTRAINT cod_rooms_referral_bps_check CHECK (referral_rate_bps BETWEEN 0 AND 10000)
);
CREATE INDEX IF NOT EXISTS cod_rooms_status_start_idx ON cod_rooms(status, starts_at);
CREATE INDEX IF NOT EXISTS cod_rooms_region_published_idx ON cod_rooms(region, is_published);

CREATE TABLE IF NOT EXISTS cod_room_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES cod_rooms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role varchar(20) NOT NULL,
  assigned_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cod_room_staff_role_check CHECK (role IN ('roomer', 'spectator', 'judge')),
  UNIQUE(room_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS cod_room_staff_user_idx ON cod_room_staff(user_id);

CREATE TABLE IF NOT EXISTS cod_room_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES cod_rooms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  player_id uuid REFERENCES players(id),
  team_id uuid REFERENCES teams(id),
  cod_uid_snapshot varchar(100) NOT NULL,
  cod_username_snapshot varchar(100) NOT NULL,
  region varchar(16) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'registered',
  payment_mode varchar(16) NOT NULL DEFAULT 'shadow',
  entry_fee_rial numeric(20,0) NOT NULL DEFAULT 0,
  service_fee_rial numeric(20,0) NOT NULL DEFAULT 0,
  payment_transaction_id uuid REFERENCES transactions(id),
  rules_version varchar(40) NOT NULL,
  rules_accepted_at timestamp NOT NULL,
  checked_in_at timestamp,
  joined_at timestamp,
  kills integer,
  placement integer,
  reward_rial numeric(20,0) NOT NULL DEFAULT 0,
  result_status varchar(24) NOT NULL DEFAULT 'pending',
  settled_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cod_room_entries_region_check CHECK (region IN ('global', 'garena')),
  CONSTRAINT cod_room_entries_money_check CHECK (entry_fee_rial >= 0 AND service_fee_rial >= 0),
  UNIQUE(room_id, user_id)
);
CREATE INDEX IF NOT EXISTS cod_room_entries_room_status_idx ON cod_room_entries(room_id, status);
CREATE INDEX IF NOT EXISTS cod_room_entries_user_created_idx ON cod_room_entries(user_id, created_at);

CREATE TABLE IF NOT EXISTS cod_room_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES cod_rooms(id),
  entry_id uuid REFERENCES cod_room_entries(id),
  uploaded_by_id uuid NOT NULL REFERENCES users(id),
  kind varchar(24) NOT NULL,
  file_url text NOT NULL,
  content_hash varchar(64),
  status varchar(20) NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cod_room_evidence_kind_check CHECK (kind IN ('profile', 'scoreboard', 'recording', 'lobby_recording', 'dispute'))
);
CREATE INDEX IF NOT EXISTS cod_room_evidence_room_kind_idx ON cod_room_evidence(room_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS cod_room_evidence_room_hash_unique ON cod_room_evidence(room_id, content_hash) WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS cod_room_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES cod_rooms(id),
  entry_id uuid NOT NULL REFERENCES cod_room_entries(id),
  kills integer NOT NULL DEFAULT 0,
  placement integer,
  kill_reward_rial numeric(20,0) NOT NULL DEFAULT 0,
  placement_reward_rial numeric(20,0) NOT NULL DEFAULT 0,
  participation_reward_rial numeric(20,0) NOT NULL DEFAULT 0,
  total_reward_rial numeric(20,0) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'shadow',
  reward_transaction_id uuid REFERENCES transactions(id),
  verified_by_id uuid REFERENCES users(id),
  verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(room_id, entry_id)
);
CREATE INDEX IF NOT EXISTS cod_room_settlements_status_idx ON cod_room_settlements(status);

CREATE TABLE IF NOT EXISTS cod_player_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  region varchar(16) NOT NULL,
  points integer NOT NULL DEFAULT 0,
  tier varchar(20) NOT NULL DEFAULT 'rookie',
  verified_rooms integer NOT NULL DEFAULT 0,
  total_kills integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(user_id, region)
);
CREATE INDEX IF NOT EXISTS cod_player_ranks_region_points_idx ON cod_player_ranks(region, points DESC);

CREATE TABLE IF NOT EXISTS cod_room_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES cod_rooms(id),
  actor_id uuid REFERENCES users(id),
  event_type varchar(40) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cod_room_audit_room_created_idx ON cod_room_audit_events(room_id, created_at);

-- The existing affiliate ledger becomes source-agnostic without changing
-- Clash events. COD events use source_type=cod_room_entry and source_id=entry id.
ALTER TABLE affiliate_commission_events ALTER COLUMN match_id DROP NOT NULL;
ALTER TABLE affiliate_commission_events
  ADD COLUMN IF NOT EXISTS source_type varchar(30) NOT NULL DEFAULT 'clash_match';
ALTER TABLE affiliate_commission_events
  ADD COLUMN IF NOT EXISTS source_id varchar(100);
UPDATE affiliate_commission_events
SET source_type = 'clash_match', source_id = match_id::text
WHERE source_id IS NULL AND match_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commission_events_source_unique_idx
  ON affiliate_commission_events(source_type, source_id)
  WHERE source_id IS NOT NULL;
