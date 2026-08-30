import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isLikelyPostgresUrl, normalizeDatabaseUrl } from "@/lib/database-url";
import { shouldUseSsl } from "@/db/ssl-policy";

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

const isNextProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

if (!databaseUrl) {
  // Route modules can be imported during `next build` even when no database is
  // needed. Keep builds/CI noise-free; runtime health/API calls will still fail
  // clearly if DATABASE_URL is missing.
  if (!isNextProductionBuild) {
    console.error("CRITICAL ERROR: DATABASE_URL is missing in environment variables!");
  }
} else if (!isLikelyPostgresUrl(databaseUrl)) {
  console.error("CRITICAL ERROR: DATABASE_URL must start with postgresql://");
}

/**
 * SSL configuration.
 *
 * Neon (and most managed Postgres) present certificates signed by a real CA,
 * so certificate verification SHOULD stay on. Disabling it (rejectUnauthorized
 * = false) opens the connection to man-in-the-middle attacks.
 *
 * If a specific host genuinely needs a relaxed check, opt out explicitly by
 * setting DB_SSL_NO_VERIFY="true" — but treat that as a last resort.
 */
const noVerify = process.env.DB_SSL_NO_VERIFY === "true";

const useSsl = shouldUseSsl(databaseUrl);

const globalForDb = globalThis as typeof globalThis & {
  __flexaPool?: Pool;
};

const configuredPoolMax = Number(process.env.DB_POOL_MAX || process.env.PGPOOL_MAX || "");
const poolMax = Number.isFinite(configuredPoolMax) && configuredPoolMax > 0
  ? Math.min(Math.max(Math.floor(configuredPoolMax), 1), 30)
  : process.env.NODE_ENV === "production"
    ? 5
    : 10;

export const pool =
  globalForDb.__flexaPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: !noVerify } : false,
    max: poolMax,
    min: 0,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
    maxUses: Number(process.env.DB_MAX_USES || 7500),
    keepAlive: true,
    application_name: process.env.DB_APPLICATION_NAME || "flexa-next",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__flexaPool = pool;
}

/**
 * Exported so /api/health can report utilisation against the real ceiling
 * instead of a hardcoded guess that drifts when DB_POOL_MAX changes.
 */
export const POOL_MAX = poolMax;

/**
 * A pool acquire timeout is the signature of saturation: every connection is
 * checked out and the queue did not drain within connectionTimeoutMillis.
 *
 * pg surfaces it as a generic error from the query, which reads like a
 * database fault. Counting it separately keeps "we are out of connections"
 * distinguishable from "the database rejected this query".
 */
pool.on("error", (error) => {
  const message = String((error as Error)?.message || "");
  if (/timeout exceeded when trying to connect/i.test(message)) {
    void import("@/lib/pool-metrics").then((m) => m.recordAcquireTimeout());
  }
});

export const db = drizzle(pool);
