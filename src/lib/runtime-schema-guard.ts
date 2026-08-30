/**
 * Runtime schema bootstrap switch.
 *
 * Several services call an `ensure*Schema()` helper before touching their
 * tables. Those helpers issue real DDL — CREATE TABLE, ALTER TABLE, even a
 * data-backfilling UPDATE — from inside request handlers, including the paid
 * COD room join and settlement paths.
 *
 * That was a reasonable bootstrap when the schema was moving fast, but it is
 * the wrong thing to keep on a live wallet-bearing deployment:
 *
 *   - ALTER TABLE takes an ACCESS EXCLUSIVE lock. On the payment path that
 *     means a schema change can block every reader of the table mid-payment.
 *   - It requires the application role to hold DDL privileges in production.
 *   - Two of the statements are not idempotent (`ALTER COLUMN ... DROP NOT
 *     NULL` and a backfilling `UPDATE`), so they re-run on every cold start.
 *   - Every statement is already covered by a reviewed migration:
 *     `0036_add_cod_mobile_room_engine.sql` (COD engine + affiliate columns),
 *     `0037`, `0038`, and `0025_repair_wallet_money_types.sql` (money types).
 *
 * So the runtime DDL is pure duplication. It is now **off by default**: the
 * schema is expected to come from `./scripts/apply-migrations.sh`.
 *
 * Set `ALLOW_RUNTIME_SCHEMA_DDL="true"` to restore the old behaviour — useful
 * for a scratch dev database, or as a one-off escape hatch if a deploy ever
 * lands before its migration does.
 *
 * Tests and any caller passing an explicit transaction/client still run the
 * DDL, so unit tests that build a throwaway schema keep working.
 */

export function runtimeSchemaDdlEnabled(): boolean {
  const raw = (process.env.ALLOW_RUNTIME_SCHEMA_DDL || "").trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;

  // Unset: allow outside production (scratch databases), block in production
  // where migrations are the reviewed, auditable path.
  return process.env.NODE_ENV !== "production";
}
