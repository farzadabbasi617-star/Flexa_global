-- Clash Royale private-tournament leaderboard OCR + confirmed standings.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS "tournament_leaderboard_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL REFERENCES "tournaments"("id"),
  "submitted_by_id" uuid REFERENCES "users"("id"),
  "image_url" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "parsed_data" jsonb,
  "ai_provider" varchar(50),
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "tournament_leaderboard_submissions_tournament_idx"
  ON "tournament_leaderboard_submissions" ("tournament_id");
CREATE INDEX IF NOT EXISTS "tournament_leaderboard_submissions_status_idx"
  ON "tournament_leaderboard_submissions" ("status");

CREATE TABLE IF NOT EXISTS "private_tournament_standings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL REFERENCES "tournaments"("id"),
  "submission_id" uuid REFERENCES "tournament_leaderboard_submissions"("id"),
  "rank" integer NOT NULL,
  "player_id" uuid REFERENCES "players"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "player_tag" varchar(32),
  "player_name" varchar(100) NOT NULL,
  "score" integer,
  "verified" boolean NOT NULL DEFAULT false,
  "source" varchar(30) NOT NULL DEFAULT 'leaderboard_ocr',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "private_tournament_standings_tournament_rank_unique" UNIQUE("tournament_id", "rank")
);
CREATE INDEX IF NOT EXISTS "private_tournament_standings_tournament_player_idx"
  ON "private_tournament_standings" ("tournament_id", "player_id");
CREATE INDEX IF NOT EXISTS "private_tournament_standings_user_idx"
  ON "private_tournament_standings" ("user_id");
