-- Store price-negotiation offers. Idempotent.
-- A buyer proposes a price on a user listing; the seller accepts (creating an
-- escrow order at the agreed price) or rejects.

DO $$ BEGIN
  CREATE TYPE store_offer_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS store_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES store_listings(id),
  buyer_id uuid NOT NULL REFERENCES users(id),
  seller_id uuid NOT NULL REFERENCES users(id),
  offer_price_rial numeric(20, 0) NOT NULL,
  listing_price_rial numeric(20, 0) NOT NULL,
  message text,
  status store_offer_status NOT NULL DEFAULT 'pending',
  order_id uuid REFERENCES store_orders(id),
  responded_at timestamp,
  expires_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_offers_listing_idx ON store_offers (listing_id);
CREATE INDEX IF NOT EXISTS store_offers_buyer_idx ON store_offers (buyer_id);
CREATE INDEX IF NOT EXISTS store_offers_seller_status_idx ON store_offers (seller_id, status);
