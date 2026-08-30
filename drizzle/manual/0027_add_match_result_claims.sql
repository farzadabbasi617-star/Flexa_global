-- Independent claims from both players for safe Clash Royale 1V1 settlement.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS "match_result_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id"),
  "player_id" uuid NOT NULL REFERENCES "players"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "telegram_id" varchar(32),
  "claim" varchar(10) NOT NULL CHECK ("claim" IN ('win', 'lose')),
  "submitted_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "match_result_claims_match_player_unique" UNIQUE("match_id", "player_id")
);

CREATE INDEX IF NOT EXISTS "match_result_claims_match_idx"
  ON "match_result_claims" ("match_id");
CREATE INDEX IF NOT EXISTS "match_result_claims_user_idx"
  ON "match_result_claims" ("user_id");
