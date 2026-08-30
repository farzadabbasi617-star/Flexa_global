-- Two-stage referral onboarding.
--
-- Getting a referral link used to require the same paperwork as withdrawing
-- money: a valid Iranian national id, a 12-clause contract, six confirmation
-- checkboxes, a signer name and an email OTP. Seven steps to copy a string.
-- Six of eighteen live users could not even start because they had no national
-- id on file, and the programme had produced 8 clicks and zero commissions.
--
-- The link stage now needs only a short rules acceptance. The legal contract,
-- national id and sheba move to the cash-withdrawal stage, where they are
-- actually required and where the user has a reason to complete them.
--
-- `national_id` becomes nullable for the same reason: a partner row can now
-- exist before the user has provided one.
--
-- Idempotent: safe to run more than once.

ALTER TABLE media_partners
  ADD COLUMN IF NOT EXISTS quick_rules_accepted_at timestamp,
  ADD COLUMN IF NOT EXISTS quick_rules_version varchar(60);

ALTER TABLE media_partners
  ALTER COLUMN national_id DROP NOT NULL;

-- Existing partners signed the full contract, which supersedes the short
-- rules. Backfill so they are never asked to step backwards.
UPDATE media_partners
   SET quick_rules_accepted_at = COALESCE(contract_accepted_at, created_at),
       quick_rules_version = 'legacy-full-contract'
 WHERE quick_rules_accepted_at IS NULL
   AND partner_type = 'personal';

CREATE INDEX IF NOT EXISTS media_partners_quick_rules_idx
  ON media_partners (partner_type, quick_rules_accepted_at);
