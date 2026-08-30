-- Web referral attribution.
--
-- Referral attribution was keyed exclusively on `telegram_id`, which is NOT NULL
-- and UNIQUE. That made the Telegram bot the only possible entry point: a link
-- shared on WhatsApp, Instagram or SMS produced an unattributed signup and the
-- referrer was never paid.
--
-- Web visitors have no Telegram id, so the column now accepts a synthetic
-- `web:<uuid>` value written by /r/<code>. The uniqueness guarantee still holds
-- (one attribution row per visitor) and the Telegram path is untouched.
--
-- Idempotent: safe to run more than once.

ALTER TABLE affiliate_attributions
  ADD COLUMN IF NOT EXISTS visitor_key varchar(64);

-- Backfill existing rows so the new key is never null for historical data.
UPDATE affiliate_attributions
   SET visitor_key = 'tg:' || telegram_id
 WHERE visitor_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_attributions_visitor_key_idx
  ON affiliate_attributions (visitor_key)
  WHERE visitor_key IS NOT NULL;

-- Widen the source vocabulary. `source` is a plain varchar with no CHECK, so
-- 'web_invite_link' needs no constraint change; the index below keeps the
-- admin dashboard's per-source breakdown cheap.
CREATE INDEX IF NOT EXISTS affiliate_attributions_source_idx
  ON affiliate_attributions (source, attributed_at DESC);

CREATE INDEX IF NOT EXISTS affiliate_clicks_source_idx
  ON affiliate_clicks (source, created_at DESC);
