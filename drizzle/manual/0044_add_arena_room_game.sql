-- The custom-room engine was written for Call of Duty Mobile but everything that
-- matters — prize tables, occupancy scaling, check-in, evidence, settlement,
-- rank, referral — is game-agnostic. Only the player's in-game identity, the
-- region list, team sizes and the invite-link format actually differ.
--
-- Adding `game` lets one engine serve several titles instead of forking ~1900
-- lines per game. Existing rows are all Call of Duty, which is the default, so
-- no backfill is needed and nothing changes for them.
--
-- Fortnite specifics handled in application config (arena-games.ts):
--   - regions are eu/nae/naw/me/asia/oce/brazil rather than global/garena
--   - trio is a real team mode
--   - entry is via an Epic Custom Matchmaking Key; there is no invite-link form
--   - there is no account-level gate, so min_cod_level stays unused
--
-- Safe to run repeatedly.

ALTER TABLE cod_rooms
  ADD COLUMN IF NOT EXISTS game varchar(24) NOT NULL DEFAULT 'cod_mobile';

DO $$
BEGIN
  ALTER TABLE cod_rooms
    ADD CONSTRAINT cod_rooms_game_check CHECK (game IN ('cod_mobile', 'fortnite'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The room list filters by game and orders by start time.
CREATE INDEX IF NOT EXISTS cod_rooms_game_start_idx
  ON cod_rooms (game, starts_at)
  WHERE is_published = true;

-- Entries snapshot the identity that was verified at join time, which is now
-- per-game rather than always a COD UID.
ALTER TABLE cod_room_entries
  ADD COLUMN IF NOT EXISTS game varchar(24) NOT NULL DEFAULT 'cod_mobile';

-- The original CHECK constraints hardcoded Call of Duty's region list and team
-- modes, so a Fortnite room was rejected at insert time. Widen them to the union
-- of both games; per-game validity is enforced in arena-games.ts, which knows
-- that "garena" is meaningless for Fortnite and "trio" is meaningless for COD.
DO $$
BEGIN
  ALTER TABLE cod_rooms DROP CONSTRAINT IF EXISTS cod_rooms_region_check;
  ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_region_check
    CHECK (region IN ('global','garena','eu','nae','naw','me','asia','oce','brazil'));

  ALTER TABLE cod_rooms DROP CONSTRAINT IF EXISTS cod_rooms_team_mode_check;
  ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_team_mode_check
    CHECK (team_mode IN ('solo','duo','trio','squad'));
END $$;
