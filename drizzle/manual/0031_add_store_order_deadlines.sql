-- Escrow delivery and auto-release deadlines. Safe to run repeatedly.

ALTER TABLE "store_orders"
  ADD COLUMN IF NOT EXISTS "delivery_deadline_at" timestamp,
  ADD COLUMN IF NOT EXISTS "auto_release_at" timestamp;

CREATE INDEX IF NOT EXISTS "store_orders_delivery_deadline_idx"
  ON "store_orders" ("status", "delivery_deadline_at");
CREATE INDEX IF NOT EXISTS "store_orders_auto_release_idx"
  ON "store_orders" ("status", "auto_release_at");
