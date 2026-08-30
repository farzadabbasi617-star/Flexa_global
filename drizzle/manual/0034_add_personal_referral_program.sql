-- Extend the audited media affiliate ledger to ordinary Gament referrers.
-- The one 7,000-Toman pool per paid Match is shared by media and personal referrers.

ALTER TABLE media_partners
  ADD COLUMN IF NOT EXISTS partner_type varchar(20) NOT NULL DEFAULT 'media';

ALTER TABLE media_partners
  ALTER COLUMN sheba DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE media_partners
    ADD CONSTRAINT media_partners_type_check
    CHECK (partner_type IN ('media', 'personal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS media_partners_type_status_idx
  ON media_partners(partner_type, status);

ALTER TABLE affiliate_payouts
  ADD COLUMN IF NOT EXISTS destination varchar(20) NOT NULL DEFAULT 'bank';

DO $$ BEGIN
  ALTER TABLE affiliate_payouts
    ADD CONSTRAINT affiliate_payouts_destination_check
    CHECK (destination IN ('bank', 'gaming_wallet'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
