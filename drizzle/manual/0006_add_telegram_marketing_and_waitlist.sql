-- Telegram marketing, coupon and waiting-list layer.

CREATE TABLE IF NOT EXISTS "telegram_campaign_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign" varchar(100) NOT NULL,
  "telegram_id" varchar(32) NOT NULL,
  "telegram_username" varchar(100),
  "event_type" varchar(50) DEFAULT 'start' NOT NULL,
  "raw_payload" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "telegram_campaign_events_campaign_idx" ON "telegram_campaign_events" ("campaign");
CREATE INDEX IF NOT EXISTS "telegram_campaign_events_telegram_idx" ON "telegram_campaign_events" ("telegram_id");
CREATE INDEX IF NOT EXISTS "telegram_campaign_events_event_idx" ON "telegram_campaign_events" ("event_type");

CREATE TABLE IF NOT EXISTS "coupons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(50) NOT NULL,
  "title" varchar(120),
  "discount_percent" integer DEFAULT 0 NOT NULL,
  "max_uses" integer,
  "used_count" integer DEFAULT 0 NOT NULL,
  "game" varchar(50),
  "tournament_id" uuid REFERENCES "tournaments"("id"),
  "expires_at" timestamp,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
CREATE INDEX IF NOT EXISTS "coupons_code_idx" ON "coupons" ("code");
CREATE INDEX IF NOT EXISTS "coupons_active_idx" ON "coupons" ("is_active");
CREATE INDEX IF NOT EXISTS "coupons_tournament_idx" ON "coupons" ("tournament_id");

CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "coupon_id" uuid NOT NULL REFERENCES "coupons"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "telegram_id" varchar(32),
  "tournament_id" uuid REFERENCES "tournaments"("id"),
  "status" varchar(30) DEFAULT 'active' NOT NULL,
  "discount_rial" numeric(20, 0) DEFAULT '0' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "used_at" timestamp
);
CREATE INDEX IF NOT EXISTS "coupon_redemptions_coupon_idx" ON "coupon_redemptions" ("coupon_id");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_user_idx" ON "coupon_redemptions" ("user_id");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_telegram_idx" ON "coupon_redemptions" ("telegram_id");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_status_idx" ON "coupon_redemptions" ("status");

CREATE TABLE IF NOT EXISTS "tournament_waitlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL REFERENCES "tournaments"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "telegram_id" varchar(32),
  "status" varchar(30) DEFAULT 'waiting' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "notified_at" timestamp
);
CREATE INDEX IF NOT EXISTS "tournament_waitlist_tournament_idx" ON "tournament_waitlist" ("tournament_id");
CREATE INDEX IF NOT EXISTS "tournament_waitlist_user_idx" ON "tournament_waitlist" ("user_id");
CREATE INDEX IF NOT EXISTS "tournament_waitlist_telegram_idx" ON "tournament_waitlist" ("telegram_id");
CREATE INDEX IF NOT EXISTS "tournament_waitlist_status_idx" ON "tournament_waitlist" ("status");

CREATE TABLE IF NOT EXISTS "telegram_channel_posts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL REFERENCES "tournaments"("id"),
  "chat_id" varchar(100) NOT NULL,
  "message_id" integer NOT NULL,
  "kind" varchar(50) DEFAULT 'tournament' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "telegram_channel_posts_tournament_idx" ON "telegram_channel_posts" ("tournament_id");
CREATE INDEX IF NOT EXISTS "telegram_channel_posts_chat_idx" ON "telegram_channel_posts" ("chat_id");

-- Useful default coupons. Safe to run repeatedly.
INSERT INTO "coupons" ("code", "title", "discount_percent", "max_uses", "is_active") VALUES
  ('GAMENT50', 'Launch 50% discount', 50, 500, true),
  ('GAMENT20', 'Launch 20% discount', 20, 1000, true),
  ('WELCOME', 'Welcome 10% discount', 10, 1000, true)
ON CONFLICT ("code") DO NOTHING;
