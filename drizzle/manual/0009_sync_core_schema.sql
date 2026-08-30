-- Sync core Gament schema for databases that were created from the early
-- partial migration instead of `drizzle-kit push`.
--
-- Safe/idempotent: uses IF NOT EXISTS where possible. On old databases this
-- adds the missing core product tables/columns used by tournaments, brackets,
-- players, teams, notifications, achievements and admin auditing.

DO $$ BEGIN
  CREATE TYPE game_type AS ENUM ('clash_royale', 'cod_mobile', 'fortnite');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tournament_status AS ENUM ('registration', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE match_status AS ENUM ('pending', 'in_progress', 'awaiting_judgment', 'completed', 'disputed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tournament_format AS ENUM ('single_elimination', 'double_elimination', 'round_robin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bring early text money columns in line with the Drizzle schema.
ALTER TABLE wallets ALTER COLUMN balance DROP DEFAULT;
ALTER TABLE wallets
  ALTER COLUMN balance TYPE numeric(20,0) USING COALESCE(NULLIF(balance::text, ''), '0')::numeric(20,0),
  ALTER COLUMN balance SET DEFAULT 0;

ALTER TABLE transactions ALTER COLUMN amount DROP DEFAULT;
ALTER TABLE transactions
  ALTER COLUMN amount TYPE numeric(20,0) USING COALESCE(NULLIF(amount::text, ''), '0')::numeric(20,0);

-- Columns added after the early baseline migration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS clash_royale_username varchar(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS cod_mobile_username varchar(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS fortnite_username varchar(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version varchar(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE site_images ADD COLUMN IF NOT EXISTS alt_text varchar(255);
ALTER TABLE site_images ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format tournament_format NOT NULL DEFAULT 'single_elimination';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS status tournament_status NOT NULL DEFAULT 'registration';
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 16;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS category_label varchar(100);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS game_mode varchar(100);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS map_name varchar(100);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS server_slots integer DEFAULT 16;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_1st varchar(100);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_2nd varchar(100);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_3rd varchar(100);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_4to10 varchar(100);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS rules text;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS banner_url varchar(500);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS room_id varchar(100);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS room_password varchar(100);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS lobby_notes text;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS room_visible_at timestamp;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES users(id);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  type varchar(50) NOT NULL,
  title varchar(255) NOT NULL,
  message text NOT NULL,
  link varchar(500),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  tag varchar(10) NOT NULL,
  logo_url varchar(500),
  owner_id uuid NOT NULL REFERENCES users(id),
  description text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role varchar(50) NOT NULL DEFAULT 'member',
  joined_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS team_members_team_id_idx ON team_members(team_id);
CREATE INDEX IF NOT EXISTS team_members_user_id_idx ON team_members(user_id);

CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  name_fa varchar(100) NOT NULL,
  description varchar(255) NOT NULL,
  description_fa varchar(255) NOT NULL,
  icon varchar(50) NOT NULL,
  category varchar(50) NOT NULL,
  requirement integer NOT NULL,
  points integer NOT NULL DEFAULT 10
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  achievement_id uuid NOT NULL REFERENCES achievements(id),
  unlocked_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_achievements_user_id_idx ON user_achievements(user_id);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  username varchar(100) NOT NULL,
  display_name varchar(100) NOT NULL,
  email varchar(255),
  avatar_url varchar(500),
  game_id varchar(100),
  rating integer NOT NULL DEFAULT 1000,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_user_id_idx ON players(user_id);

CREATE TABLE IF NOT EXISTS registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  player_id uuid NOT NULL REFERENCES players(id),
  user_id uuid NOT NULL REFERENCES users(id),
  seed integer,
  checked_in_at timestamp,
  registered_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registrations_tournament_id_idx ON registrations(tournament_id);
CREATE INDEX IF NOT EXISTS registrations_player_id_idx ON registrations(player_id);

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id),
  round integer NOT NULL,
  match_number integer NOT NULL,
  player1_id uuid REFERENCES players(id),
  player2_id uuid REFERENCES players(id),
  winner_id uuid REFERENCES players(id),
  player1_score integer,
  player2_score integer,
  status match_status NOT NULL DEFAULT 'pending',
  scheduled_at timestamp,
  completed_at timestamp,
  evidence jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS matches_tournament_id_idx ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS matches_player1_id_idx ON matches(player1_id);
CREATE INDEX IF NOT EXISTS matches_player2_id_idx ON matches(player2_id);

CREATE TABLE IF NOT EXISTS match_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id),
  uploaded_by_id uuid NOT NULL REFERENCES users(id),
  file_url varchar(500) NOT NULL,
  file_type varchar(50) NOT NULL,
  description text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS match_evidence_match_id_idx ON match_evidence(match_id);

CREATE TABLE IF NOT EXISTS judges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  name varchar(100) NOT NULL,
  email varchar(255),
  role varchar(50) NOT NULL DEFAULT 'judge',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS judgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id),
  judge_id uuid REFERENCES judges(id),
  is_ai_judgment boolean NOT NULL DEFAULT false,
  verdict varchar(50) NOT NULL,
  reasoning text,
  confidence integer,
  score_breakdown jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS judgments_match_id_idx ON judgments(match_id);

CREATE TABLE IF NOT EXISTS disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id),
  raised_by_id uuid NOT NULL REFERENCES players(id),
  reason text NOT NULL,
  evidence_urls jsonb,
  status varchar(50) NOT NULL DEFAULT 'open',
  resolution text,
  resolved_by_id uuid REFERENCES judges(id),
  created_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp
);
CREATE INDEX IF NOT EXISTS disputes_match_id_idx ON disputes(match_id);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  permission varchar(80) NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_permissions_user_permission_idx ON admin_permissions(user_id, permission);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES users(id),
  action varchar(100) NOT NULL,
  entity_type varchar(100) NOT NULL,
  entity_id varchar(100),
  metadata jsonb,
  ip_address varchar(45),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_admin_idx ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_entity_idx ON admin_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_logs(created_at);
