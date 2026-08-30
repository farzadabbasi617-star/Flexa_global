-- Stores per-registration game invite material (Clash Royale QR / Share Link)
-- so the Telegram bot can auto-pair paid Clash Royale participants and send
-- each opponent the other player's invite link/QR.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS game_invite_link text,
  ADD COLUMN IF NOT EXISTS game_invite_qr_file_id varchar(255),
  ADD COLUMN IF NOT EXISTS game_invite_submitted_at timestamp;

CREATE INDEX IF NOT EXISTS registrations_game_invite_queue_idx
  ON registrations (tournament_id, game_invite_submitted_at)
  WHERE game_invite_submitted_at IS NOT NULL;
