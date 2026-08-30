-- Featured (promoted) store listings.
--
-- Sellers will eventually be able to buy a placement in the storefront hero
-- carousel. The schema lands first so the surface can be built, reviewed and
-- run by admins before any money is involved; the purchase flow is deliberately
-- not part of this change.
--
-- Why these columns:
--
--   featured_until   The promotion is time-boxed, so expiry is data rather
--                    than a job that has to run. A listing is featured when
--                    this is in the future, which means a missed cron cannot
--                    leave a paid slot running forever, and re-running any
--                    cleanup is harmless.
--
--   featured_rank    Manual ordering for the carousel. Without it the order
--                    would be creation order, so an admin could not put a
--                    sponsor first without editing timestamps.
--
--   featured_status  Approval is separate from payment on purpose. A paid slot
--                    still passes through review before it appears on the
--                    front page, so buying promotion cannot buy a bypass of
--                    moderation.
--
--   featured_*_at/by Audit trail. Placements are chargeable, so "who approved
--                    this and when" has to be answerable later.
--
-- Idempotent: safe to run more than once.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_featured_status') THEN
    CREATE TYPE store_featured_status AS ENUM ('none', 'pending_review', 'approved', 'rejected');
  END IF;
END $$;

ALTER TABLE store_listings
  ADD COLUMN IF NOT EXISTS featured_status store_featured_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS featured_until timestamp,
  ADD COLUMN IF NOT EXISTS featured_rank integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS featured_requested_at timestamp,
  ADD COLUMN IF NOT EXISTS featured_reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS featured_reviewed_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS featured_rejection_reason text;

-- The carousel query filters on approved + unexpired and orders by rank, so
-- the index covers exactly that. Partial, because only a handful of rows are
-- ever featured and the rest should not bloat it.
CREATE INDEX IF NOT EXISTS store_listings_featured_idx
  ON store_listings (featured_rank DESC, featured_until DESC)
  WHERE featured_status = 'approved';
