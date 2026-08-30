-- Telegram growth and automation: referrals + de-duplication for reminders/lobby/result notifications.

CREATE TABLE IF NOT EXISTS "telegram_referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "referrer_telegram_id" varchar(32) NOT NULL,
  "referred_telegram_id" varchar(32) NOT NULL,
  "referred_username" varchar(100),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_referrals_referred_telegram_id_unique" UNIQUE("referred_telegram_id")
);

CREATE INDEX IF NOT EXISTS "telegram_referrals_referrer_idx" ON "telegram_referrals" ("referrer_telegram_id");
CREATE INDEX IF NOT EXISTS "telegram_referrals_referred_idx" ON "telegram_referrals" ("referred_telegram_id");

CREATE TABLE IF NOT EXISTS "telegram_sent_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dedupe_key" varchar(180) NOT NULL,
  "telegram_id" varchar(32),
  "tournament_id" uuid REFERENCES "tournaments"("id"),
  "type" varchar(50) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_sent_notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);

CREATE INDEX IF NOT EXISTS "telegram_sent_notifications_dedupe_idx" ON "telegram_sent_notifications" ("dedupe_key");
CREATE INDEX IF NOT EXISTS "telegram_sent_notifications_tournament_idx" ON "telegram_sent_notifications" ("tournament_id");
CREATE INDEX IF NOT EXISTS "telegram_sent_notifications_type_idx" ON "telegram_sent_notifications" ("type");
