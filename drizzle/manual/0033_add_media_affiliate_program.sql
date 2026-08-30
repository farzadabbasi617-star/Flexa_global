-- Secure media-partner / affiliate program with 30-day attribution,
-- versioned OTP contracts, one 7,000-Toman commission pool per paid Match,
-- shadow-mode ledger and auditable payouts.

CREATE TABLE IF NOT EXISTS media_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  referral_code varchar(24) NOT NULL UNIQUE,
  legal_name varchar(160) NOT NULL,
  national_id varchar(10) NOT NULL,
  sheba varchar(26) NOT NULL,
  media_name varchar(160) NOT NULL,
  media_type varchar(30) NOT NULL,
  media_url varchar(500) NOT NULL,
  follower_count integer NOT NULL DEFAULT 0,
  ownership_proof_url text,
  status varchar(30) NOT NULL DEFAULT 'draft',
  commission_rial_per_match numeric(20,0) NOT NULL DEFAULT 70000,
  attribution_days integer NOT NULL DEFAULT 30,
  minimum_payout_rial numeric(20,0) NOT NULL DEFAULT 3000000,
  contract_accepted_at timestamp,
  approved_by_id uuid REFERENCES users(id),
  approved_at timestamp,
  rejection_reason text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT media_partners_status_check CHECK (status IN ('draft','pending','active','suspended','rejected','terminated')),
  CONSTRAINT media_partners_attribution_days_check CHECK (attribution_days BETWEEN 1 AND 365),
  CONSTRAINT media_partners_follower_count_check CHECK (follower_count >= 0)
);
CREATE INDEX IF NOT EXISTS media_partners_status_idx ON media_partners(status);
CREATE UNIQUE INDEX IF NOT EXISTS media_partners_referral_code_idx ON media_partners(referral_code);
CREATE INDEX IF NOT EXISTS media_partners_national_id_idx ON media_partners(national_id);

CREATE TABLE IF NOT EXISTS media_partner_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES media_partners(id),
  user_id uuid NOT NULL REFERENCES users(id),
  contract_version varchar(60) NOT NULL,
  content_hash varchar(64) NOT NULL,
  content_snapshot text NOT NULL,
  signer_name varchar(160) NOT NULL,
  ip_address varchar(45),
  user_agent varchar(500),
  otp_verified_at timestamp NOT NULL,
  accepted_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_partner_agreements_partner_version_idx ON media_partner_agreements(partner_id, contract_version);
CREATE INDEX IF NOT EXISTS media_partner_agreements_user_idx ON media_partner_agreements(user_id);

CREATE TABLE IF NOT EXISTS media_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES media_partners(id),
  platform varchar(30) NOT NULL,
  external_id varchar(100),
  title varchar(200),
  url varchar(500),
  status varchar(20) NOT NULL DEFAULT 'pending',
  verified_by_user_id uuid REFERENCES users(id),
  verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT media_properties_status_check CHECK (status IN ('pending','verified','rejected','disabled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS media_properties_platform_external_idx ON media_properties(platform, external_id);
CREATE INDEX IF NOT EXISTS media_properties_partner_idx ON media_properties(partner_id);
CREATE INDEX IF NOT EXISTS media_properties_status_idx ON media_properties(status);

CREATE TABLE IF NOT EXISTS affiliate_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES media_partners(id),
  telegram_id varchar(32) NOT NULL UNIQUE,
  user_id uuid UNIQUE REFERENCES users(id),
  campaign_code varchar(60),
  source varchar(30) NOT NULL DEFAULT 'telegram_deep_link',
  status varchar(30) NOT NULL DEFAULT 'active',
  attributed_at timestamp NOT NULL DEFAULT now(),
  expires_at timestamp NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_attributions_status_check CHECK (status IN ('active','expired','ineligible_active_user','revoked'))
);
CREATE INDEX IF NOT EXISTS affiliate_attributions_partner_status_idx ON affiliate_attributions(partner_id, status);
CREATE INDEX IF NOT EXISTS affiliate_attributions_expires_idx ON affiliate_attributions(status, expires_at);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES media_partners(id),
  telegram_id varchar(32),
  campaign_code varchar(60),
  source varchar(30) NOT NULL DEFAULT 'telegram',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_clicks_partner_created_idx ON affiliate_clicks(partner_id, created_at);
CREATE INDEX IF NOT EXISTS affiliate_clicks_telegram_idx ON affiliate_clicks(telegram_id);

CREATE TABLE IF NOT EXISTS affiliate_commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES matches(id),
  total_amount_rial numeric(20,0) NOT NULL DEFAULT 70000,
  status varchar(20) NOT NULL DEFAULT 'shadow',
  available_at timestamp NOT NULL,
  paid_at timestamp,
  reversed_at timestamp,
  reversal_reason text,
  risk jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_commission_events_status_check CHECK (status IN ('shadow','pending','available','reserved','paid','reversed'))
);
CREATE INDEX IF NOT EXISTS affiliate_commission_events_status_available_idx ON affiliate_commission_events(status, available_at);

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES media_partners(id),
  amount_rial numeric(20,0) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'requested',
  sheba_snapshot varchar(26) NOT NULL,
  requested_at timestamp NOT NULL DEFAULT now(),
  reviewed_by_id uuid REFERENCES users(id),
  reviewed_at timestamp,
  paid_at timestamp,
  reference varchar(120),
  admin_note text,
  CONSTRAINT affiliate_payouts_status_check CHECK (status IN ('requested','approved','paid','rejected','cancelled')),
  CONSTRAINT affiliate_payouts_positive_check CHECK (amount_rial > 0)
);
CREATE INDEX IF NOT EXISTS affiliate_payouts_partner_status_idx ON affiliate_payouts(partner_id, status);

CREATE TABLE IF NOT EXISTS affiliate_commission_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES affiliate_commission_events(id),
  partner_id uuid NOT NULL REFERENCES media_partners(id),
  referred_user_id uuid REFERENCES users(id),
  amount_rial numeric(20,0) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'shadow',
  payout_id uuid REFERENCES affiliate_payouts(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_commission_shares_event_partner_unique UNIQUE (event_id, partner_id),
  CONSTRAINT affiliate_commission_shares_status_check CHECK (status IN ('shadow','pending','available','reserved','paid','reversed')),
  CONSTRAINT affiliate_commission_shares_positive_check CHECK (amount_rial > 0)
);
CREATE INDEX IF NOT EXISTS affiliate_commission_shares_partner_status_idx ON affiliate_commission_shares(partner_id, status);
CREATE INDEX IF NOT EXISTS affiliate_commission_shares_payout_idx ON affiliate_commission_shares(payout_id);
