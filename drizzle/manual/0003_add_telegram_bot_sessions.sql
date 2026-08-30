-- Telegram webhook integration: stores short-lived conversation state for users
-- talking to the Gament bot via the Next.js webhook route.

CREATE TABLE IF NOT EXISTS "telegram_bot_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "telegram_id" varchar(32) NOT NULL,
  "state" varchar(50) DEFAULT 'idle' NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_bot_sessions_telegram_id_unique" UNIQUE("telegram_id")
);

CREATE INDEX IF NOT EXISTS "telegram_bot_sessions_telegram_id_idx" ON "telegram_bot_sessions" ("telegram_id");
CREATE INDEX IF NOT EXISTS "telegram_bot_sessions_updated_at_idx" ON "telegram_bot_sessions" ("updated_at");
