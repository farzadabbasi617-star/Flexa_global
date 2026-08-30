-- Seller verification failed with "خطا در ثبت درخواست احراز هویت" whenever a
-- real photo was attached.
--
-- Cloudinary is not configured in production, so /api/store/upload falls back
-- to returning an inline `data:image/...;base64,...` URL. Validation allows
-- those up to 10 MB, but these columns were varchar(500), so every genuine
-- upload hit:
--
--   ERROR: value too long for type character varying(500)
--
-- which the route caught and reported as a generic failure. It only appeared
-- to work in testing with a 1x1 pixel image (~110 characters).
--
-- `text` is what the rest of the schema already uses for uploaded images
-- (site_images.url, media_partners.ownership_proof_url, store_listings.images),
-- and Postgres stores varchar and text identically — no extra cost. Widening
-- never truncates existing data. Safe to run repeatedly.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kyc_profiles'
      AND column_name = 'id_card_image_url' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE kyc_profiles ALTER COLUMN id_card_image_url TYPE text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kyc_profiles'
      AND column_name = 'selfie_image_url' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE kyc_profiles ALTER COLUMN selfie_image_url TYPE text;
  END IF;
END $$;
