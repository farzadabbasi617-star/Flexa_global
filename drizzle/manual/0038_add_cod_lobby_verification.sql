-- COD Arena lobby verification.
-- Stores AI/OCR results for lobby screenshots sent to Telegram.
-- Media itself stays on Telegram; Gament stores only Telegram file references and extracted metadata.

CREATE TABLE IF NOT EXISTS cod_room_lobby_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES cod_rooms(id),
  uploaded_by_id uuid NOT NULL REFERENCES users(id),
  telegram_file_id text,
  telegram_file_unique_id text,
  source_kind varchar(24) NOT NULL DEFAULT 'telegram_photo',
  status varchar(24) NOT NULL DEFAULT 'manual_review',
  extracted_usernames jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_usernames jsonb NOT NULL DEFAULT '[]'::jsonb,
  unauthorized_usernames jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_checked_in_usernames jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_count integer NOT NULL DEFAULT 0,
  unauthorized_count integer NOT NULL DEFAULT 0,
  missing_checked_in_count integer NOT NULL DEFAULT 0,
  confidence integer NOT NULL DEFAULT 0,
  ai_provider varchar(30),
  ai_model varchar(120),
  raw_ai_response text,
  operator_note text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT cod_room_lobby_checks_status_check CHECK (status IN ('verified', 'flagged', 'manual_review', 'failed')),
  CONSTRAINT cod_room_lobby_checks_counts_check CHECK (
    matched_count >= 0 AND unauthorized_count >= 0 AND missing_checked_in_count >= 0 AND confidence BETWEEN 0 AND 100
  )
);
CREATE INDEX IF NOT EXISTS cod_room_lobby_checks_room_created_idx ON cod_room_lobby_checks(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cod_room_lobby_checks_status_idx ON cod_room_lobby_checks(status, created_at DESC);
