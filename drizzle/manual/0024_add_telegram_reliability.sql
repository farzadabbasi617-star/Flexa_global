-- Telegram webhook idempotency + PostgreSQL outbox.
-- Safe to execute repeatedly on existing databases.

CREATE TABLE IF NOT EXISTS "telegram_webhook_updates" (
  "update_id" varchar(32) PRIMARY KEY,
  "status" varchar(20) NOT NULL DEFAULT 'processing',
  "attempts" integer NOT NULL DEFAULT 1,
  "locked_until" timestamp NOT NULL,
  "last_error" text,
  "received_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "expires_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "telegram_webhook_updates_status_lock_idx"
  ON "telegram_webhook_updates" ("status", "locked_until");
CREATE INDEX IF NOT EXISTS "telegram_webhook_updates_expires_idx"
  ON "telegram_webhook_updates" ("expires_at");

CREATE TABLE IF NOT EXISTS "telegram_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dedupe_key" varchar(191) UNIQUE,
  "chat_id" varchar(100) NOT NULL,
  "method" varchar(50) NOT NULL DEFAULT 'sendMessage',
  "payload" jsonb NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "priority" integer NOT NULL DEFAULT 0,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 5,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "locked_until" timestamp,
  "last_error" text,
  "telegram_message_id" varchar(64),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "sent_at" timestamp
);

CREATE INDEX IF NOT EXISTS "telegram_outbox_due_idx"
  ON "telegram_outbox" ("status", "next_attempt_at", "priority");
CREATE INDEX IF NOT EXISTS "telegram_outbox_lock_idx"
  ON "telegram_outbox" ("status", "locked_until");
