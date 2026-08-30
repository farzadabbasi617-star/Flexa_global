import { db } from "@/db";
import { sql } from "drizzle-orm";
import { runtimeSchemaDdlEnabled } from "@/lib/runtime-schema-guard";

let moneySchemaPromise: Promise<void> | null = null;

/**
 * Repair databases created from the early schema where money was stored as
 * text. Values are preserved; malformed legacy values are safely converted to
 * zero instead of aborting the migration.
 */
async function repairMoneySchema(client: any) {
  await client.execute(sql.raw(`
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
  `));
}

export async function ensureWalletMoneySchema(client: any = db) {
  if (client !== db) return repairMoneySchema(client);

  // This is a one-off repair for early databases whose money columns were
  // text. It ships as migration 0025 and must not run ALTER TABLE from inside
  // a live wallet transaction. See runtime-schema-guard.ts.
  if (!runtimeSchemaDdlEnabled()) return;

  if (!moneySchemaPromise) {
    moneySchemaPromise = repairMoneySchema(client).catch((error) => {
      moneySchemaPromise = null;
      throw error;
    });
  }
  return moneySchemaPromise;
}

export async function walletBalanceColumnType(client: any): Promise<string> {
  const result = await client.execute(sql`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'balance'
    LIMIT 1
  `);
  return String(result?.rows?.[0]?.data_type || "numeric");
}

/** Atomic, non-negative wallet mutation compatible with text and numeric DBs. */
export async function updateWalletBalanceSafely(
  client: any,
  walletId: string,
  amountRial: bigint,
  direction: "increase" | "decrease"
) {
  const amount = amountRial.toString();
  const now = new Date();
  const type = await walletBalanceColumnType(client);
  const isText = type === "text" || type === "character varying";

  const result = direction === "increase"
    ? isText
      ? await client.execute(sql`
          UPDATE wallets
          SET balance = ((COALESCE(NULLIF(balance, ''), '0'))::numeric + ${amount}::numeric)::text,
              updated_at = ${now}
          WHERE id = ${walletId}
          RETURNING id, user_id, balance, currency, updated_at
        `)
      : await client.execute(sql`
          UPDATE wallets
          SET balance = balance::numeric + ${amount}::numeric,
              updated_at = ${now}
          WHERE id = ${walletId}
          RETURNING id, user_id, balance, currency, updated_at
        `)
    : isText
      ? await client.execute(sql`
          UPDATE wallets
          SET balance = ((COALESCE(NULLIF(balance, ''), '0'))::numeric - ${amount}::numeric)::text,
              updated_at = ${now}
          WHERE id = ${walletId}
            AND (COALESCE(NULLIF(balance, ''), '0'))::numeric >= ${amount}::numeric
          RETURNING id, user_id, balance, currency, updated_at
        `)
      : await client.execute(sql`
          UPDATE wallets
          SET balance = balance::numeric - ${amount}::numeric,
              updated_at = ${now}
          WHERE id = ${walletId} AND balance::numeric >= ${amount}::numeric
          RETURNING id, user_id, balance, currency, updated_at
        `);

  return result?.rows?.[0] || null;
}
