-- Adds email_verified_at to users. Idempotent (safe to run more than once).
--
-- Registration now sends the account confirmation OTP to email instead of
-- SMS (mobile number is still required/collected, just no longer the
-- verification channel). This column tracks when that email OTP was
-- confirmed and is checked at login time to block unverified accounts.
--
-- Existing rows are backfilled from phone_verified_at (or created_at, for
-- rows created before phone verification existed) so accounts that were
-- already trusted/active before this migration don't get locked out of
-- login. New registrations after this migration will have this column
-- NULL until the user completes the email OTP step.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamp;

UPDATE users
SET email_verified_at = COALESCE(phone_verified_at, created_at)
WHERE email_verified_at IS NULL;
