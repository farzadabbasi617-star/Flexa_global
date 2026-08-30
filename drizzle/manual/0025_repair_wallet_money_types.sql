-- Repair early databases where wallet/transaction money columns were text.
-- Existing valid integer/decimal strings are preserved. Malformed legacy
-- values become zero so the migration cannot be blocked by one bad row.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallets'
      AND column_name = 'balance' AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE wallets ALTER COLUMN balance DROP DEFAULT;
    ALTER TABLE wallets
      ALTER COLUMN balance TYPE numeric(20,0)
      USING CASE
        WHEN trim(balance::text) ~ '^-?[0-9]+([.][0-9]+)?$' THEN balance::numeric(20,0)
        ELSE 0::numeric(20,0)
      END;
    ALTER TABLE wallets ALTER COLUMN balance SET DEFAULT 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
      AND column_name = 'amount' AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE transactions ALTER COLUMN amount DROP DEFAULT;
    ALTER TABLE transactions
      ALTER COLUMN amount TYPE numeric(20,0)
      USING CASE
        WHEN trim(amount::text) ~ '^-?[0-9]+([.][0-9]+)?$' THEN amount::numeric(20,0)
        ELSE 0::numeric(20,0)
      END;
  END IF;
END $$;
