-- Store trust & safety: warranty, seller reviews, abuse reports. Idempotent.

-- Warranty window on listings.
ALTER TABLE store_listings ADD COLUMN IF NOT EXISTS warranty_days integer NOT NULL DEFAULT 0;

-- Report status enum.
DO $$ BEGIN
  CREATE TYPE store_report_status AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Seller reviews (one per order).
CREATE TABLE IF NOT EXISTS seller_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES store_orders(id),
  seller_id uuid NOT NULL REFERENCES users(id),
  buyer_id uuid NOT NULL REFERENCES users(id),
  rating integer NOT NULL,
  comment text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS seller_reviews_order_idx ON seller_reviews (order_id);
CREATE INDEX IF NOT EXISTS seller_reviews_seller_idx ON seller_reviews (seller_id);

-- Abuse reports.
CREATE TABLE IF NOT EXISTS store_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id),
  listing_id uuid REFERENCES store_listings(id),
  seller_id uuid REFERENCES users(id),
  order_id uuid REFERENCES store_orders(id),
  reason varchar(80) NOT NULL,
  details text,
  status store_report_status NOT NULL DEFAULT 'open',
  admin_note text,
  reviewed_by uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_reports_status_idx ON store_reports (status);
CREATE INDEX IF NOT EXISTS store_reports_listing_idx ON store_reports (listing_id);
