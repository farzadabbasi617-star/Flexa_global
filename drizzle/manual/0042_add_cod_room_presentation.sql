-- COD Arena rooms had no way to present themselves. Competing Iranian Call of
-- Duty room apps list every room with its own key art, group rooms into named
-- shelves ("100 players", "budget", "100k per kill"), and show a struck-through
-- original price next to a discounted entry fee. None of that was expressible.
--
-- Also adds `min_cod_level`. `min_rank_points` is Gament's own internal rank,
-- which is useless for gating a brand new player. Every real room instead
-- requires a minimum in-game Call of Duty account level (commonly 50) to keep
-- fresh smurf accounts out.
--
-- All columns are nullable or defaulted, so existing rows stay valid.
-- Safe to run repeatedly.

ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS banner_image_url text;
ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS category varchar(60);
ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS original_entry_fee_rial numeric(20, 0);
ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS min_cod_level integer NOT NULL DEFAULT 0;
ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS match_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cod_rooms ADD COLUMN IF NOT EXISTS faq jsonb NOT NULL DEFAULT '[]'::jsonb;

-- The room list groups published rooms by category and orders each shelf by
-- start time, which is exactly this index.
CREATE INDEX IF NOT EXISTS cod_rooms_category_start_idx
  ON cod_rooms (category, starts_at)
  WHERE is_published = true;
