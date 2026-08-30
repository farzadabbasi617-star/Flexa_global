-- Telegram bot integration: pre-registrations collected by the official Gament Telegram bot.
-- Apply on the production database before enabling TELEGRAM_INTEGRATION_SECRET.

CREATE TABLE IF NOT EXISTS "telegram_pre_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "telegram_id" varchar(32) NOT NULL,
  "telegram_username" varchar(100),
  "telegram_first_name" varchar(100),
  "telegram_last_name" varchar(100),
  "linked_user_id" uuid REFERENCES "users"("id"),
  "gament_id" varchar(20),
  "full_name" varchar(100) NOT NULL,
  "phone_number" varchar(20) NOT NULL,
  "game" varchar(50) NOT NULL,
  "platform" varchar(50),
  "gamer_tag" varchar(100) NOT NULL,
  "city" varchar(100),
  "team_name" varchar(100),
  "status" varchar(30) DEFAULT 'new' NOT NULL,
  "source" varchar(50) DEFAULT 'telegram_bot' NOT NULL,
  "raw_payload" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_pre_registrations_telegram_id_unique" UNIQUE("telegram_id")
);

CREATE INDEX IF NOT EXISTS "telegram_pre_reg_telegram_id_idx" ON "telegram_pre_registrations" ("telegram_id");
CREATE INDEX IF NOT EXISTS "telegram_pre_reg_gament_id_idx" ON "telegram_pre_registrations" ("gament_id");
CREATE INDEX IF NOT EXISTS "telegram_pre_reg_phone_idx" ON "telegram_pre_registrations" ("phone_number");
CREATE INDEX IF NOT EXISTS "telegram_pre_reg_game_idx" ON "telegram_pre_registrations" ("game");
CREATE INDEX IF NOT EXISTS "telegram_pre_reg_status_idx" ON "telegram_pre_registrations" ("status");
CREATE INDEX IF NOT EXISTS "telegram_pre_reg_created_at_idx" ON "telegram_pre_registrations" ("created_at");
