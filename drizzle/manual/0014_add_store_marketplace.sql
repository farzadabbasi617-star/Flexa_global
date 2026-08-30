-- Store / Marketplace feature
-- Adds: KYC profiles, store listings (official + user/P2P), and escrow-based orders.
-- Safe to run multiple times (idempotent guards).

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('none', 'pending', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE store_item_kind AS ENUM ('currency', 'account', 'item', 'service');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE store_listing_source AS ENUM ('official', 'user');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE store_listing_status AS ENUM ('draft', 'pending_review', 'active', 'paused', 'sold_out', 'rejected', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE store_order_status AS ENUM ('pending_payment', 'paid_escrow', 'delivered', 'completed', 'disputed', 'refunded', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Extend transaction_type with store-related kinds.
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'store_purchase';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'store_payout';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'store_escrow_hold';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'store_escrow_release';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'store_fee';

-- ---------------------------------------------------------------------------
-- KYC PROFILES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  full_name varchar(150) NOT NULL,
  national_id varchar(10) NOT NULL,
  birth_date varchar(10),
  id_card_image_url varchar(500) NOT NULL,
  selfie_image_url varchar(500) NOT NULL,
  status kyc_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamp,
  submitted_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kyc_profiles_user_id_idx ON kyc_profiles (user_id);
CREATE INDEX IF NOT EXISTS kyc_profiles_national_id_idx ON kyc_profiles (national_id);
CREATE INDEX IF NOT EXISTS kyc_profiles_status_idx ON kyc_profiles (status);

-- ---------------------------------------------------------------------------
-- STORE LISTINGS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source store_listing_source NOT NULL DEFAULT 'user',
  seller_id uuid REFERENCES users(id),
  kind store_item_kind NOT NULL,
  game game_type,
  title varchar(200) NOT NULL,
  slug varchar(220),
  description text,
  price_rial numeric(20, 0) NOT NULL,
  currency_kind varchar(50),
  currency_amount integer,
  stock integer NOT NULL DEFAULT 1,
  sold_count integer NOT NULL DEFAULT 0,
  images jsonb NOT NULL DEFAULT '[]',
  delivery_notes text,
  status store_listing_status NOT NULL DEFAULT 'pending_review',
  rejection_reason text,
  reviewed_by uuid REFERENCES users(id),
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_listings_seller_idx ON store_listings (seller_id);
CREATE INDEX IF NOT EXISTS store_listings_source_status_idx ON store_listings (source, status);
CREATE INDEX IF NOT EXISTS store_listings_kind_idx ON store_listings (kind);
CREATE INDEX IF NOT EXISTS store_listings_status_created_idx ON store_listings (status, created_at);

-- ---------------------------------------------------------------------------
-- STORE ORDERS (escrow)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES store_listings(id),
  buyer_id uuid NOT NULL REFERENCES users(id),
  seller_id uuid REFERENCES users(id),
  source store_listing_source NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price_rial numeric(20, 0) NOT NULL,
  total_price_rial numeric(20, 0) NOT NULL,
  platform_fee_rial numeric(20, 0) NOT NULL DEFAULT '0',
  seller_payout_rial numeric(20, 0) NOT NULL DEFAULT '0',
  status store_order_status NOT NULL DEFAULT 'pending_payment',
  hold_tx_id uuid,
  release_tx_id uuid,
  refund_tx_id uuid,
  delivered_at timestamp,
  completed_at timestamp,
  buyer_note text,
  dispute_reason text,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_orders_buyer_idx ON store_orders (buyer_id);
CREATE INDEX IF NOT EXISTS store_orders_seller_idx ON store_orders (seller_id);
CREATE INDEX IF NOT EXISTS store_orders_listing_idx ON store_orders (listing_id);
CREATE INDEX IF NOT EXISTS store_orders_status_idx ON store_orders (status);
