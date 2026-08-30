import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import logger from "./logger";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt?: number;
}

/**
 * Distributed, fixed-window rate limiter backed by Postgres.
 *
 * Unlike an in-memory Map, this works across multiple instances / serverless
 * invocations because the counter lives in the shared database.
 *
 * The whole thing is done in a single atomic UPSERT:
 *  - if no row (or the window expired) -> start a fresh window at count = 1
 *  - otherwise -> increment count, keeping the same reset time
 * Then we read back the row to decide allow/deny.
 *
 * Fails open: if the DB errors, we allow the request rather than locking
 * everyone out, but we log it.
 *
 * @param key       unique bucket, e.g. "login:1.2.3.4" or "ai:<ip>"
 * @param limit     max requests allowed within the window
 * @param windowMs  window length in milliseconds
 */
export async function rateLimit(
  key: string,
  limit: number = 100,
  windowMs: number = 60 * 1000
): Promise<RateLimitResult> {
  const now = Date.now();
  const newReset = new Date(now + windowMs);

  try {
    // Atomic upsert. On conflict, if the stored window is still active we
    // increment; if it has expired we reset count to 1 and start a new window.
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt: newReset })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`CASE WHEN ${rateLimits.resetAt} > NOW()
                          THEN ${rateLimits.count} + 1
                          ELSE 1 END`,
          resetAt: sql`CASE WHEN ${rateLimits.resetAt} > NOW()
                            THEN ${rateLimits.resetAt}
                            ELSE ${newReset} END`,
        },
      })
      .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

    const count = row?.count ?? 1;
    const resetAtMs = row?.resetAt ? new Date(row.resetAt).getTime() : now + windowMs;

    if (count > limit) {
      logger.warn({ key }, "Rate limit exceeded");
      return { success: false, remaining: 0, resetAt: resetAtMs };
    }

    return { success: true, remaining: Math.max(0, limit - count), resetAt: resetAtMs };
  } catch (error) {
    // Fail open so a DB hiccup doesn't take down auth/AI endpoints.
    logger.error({ error, key }, "Rate limiter DB error — allowing request");
    return { success: true, remaining: limit - 1 };
  }
}

/**
 * Best-effort cleanup of expired rate-limit rows. Call occasionally (e.g. from
 * a cron route) to keep the table small. Safe to ignore failures.
 */
export async function cleanupRateLimits(): Promise<void> {
  try {
    await db.delete(rateLimits).where(sql`${rateLimits.resetAt} < NOW()`);
  } catch (error) {
    logger.error({ error }, "Rate limit cleanup failed");
  }
}
