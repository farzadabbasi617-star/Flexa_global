-- Age-gate + light identity verification for real-money flows.
-- Adds birth_date and national_id to users. Idempotent (safe to run twice).
--
-- Product rule (Persian: «برای شرکت در تورنومنت‌های پولی و شارژ کیف پول باید
-- حداقل ۱۸ سال داشته باشید و کد ملی معتبر ثبت کرده باشید.»):
--
--   * Every real-money flow — paid tournament registration and wallet
--     top-up/withdrawal — checks these two columns via checkAgeGate() in
--     src/lib/age-gate.ts before touching the wallet.
--   * Free tournaments, browsing, chat, achievements etc. are NOT gated.
--     Legacy users without these fields can still use the free side of the
--     app; they will be asked to fill them in before their first paid action
--     (the API returns a specific error code so the UI can prompt).
--
-- national_id is UNIQUE (with NULLs allowed so legacy rows don't collide)
-- so the same document can't farm multiple paid accounts.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birth_date  varchar(10);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS national_id varchar(10);

-- Postgres unique indexes treat NULLs as distinct by default, which is
-- exactly what we want here (many legacy rows have NULL, and multiple
-- NULLs must be allowed to coexist).
CREATE UNIQUE INDEX IF NOT EXISTS users_national_id_idx
  ON users (national_id);
