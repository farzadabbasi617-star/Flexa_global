-- Seller verification no longer asks for a "selfie holding your ID card".
--
-- The national-ID card image on its own is what admins actually review, and
-- collecting a face photo alongside it is extra sensitive personal data with
-- no additional review value.
--
-- The column is kept (rather than dropped) so any historical submission stays
-- readable in the admin panel, but it is made nullable because new
-- submissions will not provide one. Safe to run repeatedly.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'kyc_profiles'
      AND column_name = 'selfie_image_url'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE kyc_profiles ALTER COLUMN selfie_image_url DROP NOT NULL;
  END IF;
END $$;
