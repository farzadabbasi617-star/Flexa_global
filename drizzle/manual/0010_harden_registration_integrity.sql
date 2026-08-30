-- Harden tournament registration integrity.
--
-- Run after removing any duplicate rows reported by the preflight queries below.
-- These unique indexes back the application-level concurrency protection in
-- POST /api/registrations and prevent duplicate paid registrations even if two
-- requests arrive at the same time.

-- Preflight: duplicate same player in same tournament
-- SELECT tournament_id, player_id, COUNT(*)
-- FROM registrations
-- GROUP BY tournament_id, player_id
-- HAVING COUNT(*) > 1;

-- Preflight: duplicate same user in same tournament
-- SELECT tournament_id, user_id, COUNT(*)
-- FROM registrations
-- GROUP BY tournament_id, user_id
-- HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_tournament_player_unique
  ON registrations (tournament_id, player_id);

CREATE UNIQUE INDEX IF NOT EXISTS registrations_tournament_user_unique
  ON registrations (tournament_id, user_id);
