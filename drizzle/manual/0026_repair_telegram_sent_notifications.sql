-- Repair notification de-duplication for databases that skipped the older
-- optional Telegram growth migration. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS "telegram_sent_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dedupe_key" varchar(180) NOT NULL UNIQUE,
  "telegram_id" varchar(32),
  "tournament_id" uuid REFERENCES "tournaments"("id"),
  "type" varchar(50) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "telegram_sent_notifications_dedupe_idx"
  ON "telegram_sent_notifications" ("dedupe_key");
CREATE INDEX IF NOT EXISTS "telegram_sent_notifications_tournament_idx"
  ON "telegram_sent_notifications" ("tournament_id");
CREATE INDEX IF NOT EXISTS "telegram_sent_notifications_type_idx"
  ON "telegram_sent_notifications" ("type");
