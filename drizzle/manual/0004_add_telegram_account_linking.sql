-- Telegram account linking: /link in the bot creates a short-lived code;
-- logged-in Gament users enter that code in the web app profile to link accounts.

CREATE TABLE IF NOT EXISTS "telegram_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "telegram_id" varchar(32) NOT NULL,
  "telegram_username" varchar(100),
  "telegram_first_name" varchar(100),
  "telegram_last_name" varchar(100),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "linked_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "telegram_accounts_telegram_id_unique" UNIQUE("telegram_id"),
  CONSTRAINT "telegram_accounts_user_id_unique" UNIQUE("user_id")
);

CREATE INDEX IF NOT EXISTS "telegram_accounts_telegram_id_idx" ON "telegram_accounts" ("telegram_id");
CREATE INDEX IF NOT EXISTS "telegram_accounts_user_id_idx" ON "telegram_accounts" ("user_id");

CREATE TABLE IF NOT EXISTS "telegram_link_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "telegram_id" varchar(32) NOT NULL,
  "code_hash" varchar(64) NOT NULL,
  "telegram_username" varchar(100),
  "telegram_first_name" varchar(100),
  "telegram_last_name" varchar(100),
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "telegram_link_codes_telegram_id_idx" ON "telegram_link_codes" ("telegram_id");
CREATE INDEX IF NOT EXISTS "telegram_link_codes_code_hash_idx" ON "telegram_link_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "telegram_link_codes_expires_at_idx" ON "telegram_link_codes" ("expires_at");
