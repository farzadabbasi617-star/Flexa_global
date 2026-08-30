import { db, pool, POOL_MAX } from "@/db";
import { poolSnapshot } from "@/lib/pool-metrics";
import { isLikelyPostgresUrl, normalizeDatabaseUrl } from "@/lib/database-url";
import { sql } from "drizzle-orm";
import { getEmailDeliveryConfiguration } from "@/lib/email-service";
import { getCryptoPaymentConfiguration } from "@/lib/cryptopayment";
import { getClashRoyaleApiConfiguration } from "@/lib/clash-royale-api";
import { affiliateCanaryFlexaIds, affiliateProgramLive, affiliateRolloutMode } from "@/lib/affiliate-service";
import { codArenaFinanceState } from "@/lib/cod-room-service";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const release = (
  process.env.RENDER_GIT_COMMIT ||
  process.env.GITHUB_SHA ||
  process.env.SOURCE_VERSION ||
  "unknown"
).slice(0, 12);

const healthHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

function unhealthy(error: string) {
  return Response.json(
    { ok: false, database: false, release, error },
    { status: 500, headers: healthHeaders },
  );
}

/**
 * The detailed payload enumerates which integrations exist, which are live and
 * which sender addresses/providers are in use. That is a free reconnaissance
 * map for anyone probing the site, so it is gated.
 *
 * `ok`, `database` and `release` stay public: uptime monitors need them and
 * they reveal nothing an attacker cannot already observe.
 *
 * Reuses TELEGRAM_CRON_SECRET rather than introducing another secret, since the
 * deploy smoke check already holds it.
 */
function detailsAuthorised(request: Request) {
  const expected = (process.env.TELEGRAM_CRON_SECRET || process.env.ADMIN_SETUP_SECRET || "").trim();
  if (!expected) return false;

  const provided = (request.headers.get("x-health-secret") || "").trim();
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  const email = getEmailDeliveryConfiguration();
  const paymentGateway = getCryptoPaymentConfiguration();
  const clashRoyaleApi = getClashRoyaleApiConfiguration();

  if (!databaseUrl) return unhealthy("DATABASE_URL_MISSING");
  if (!isLikelyPostgresUrl(databaseUrl)) return unhealthy("DATABASE_URL_INVALID_FORMAT");

  try {
    await db.execute(sql`select 1`);

    const dbPool = poolSnapshot(pool, POOL_MAX);

    if (!detailsAuthorised(request)) {
      // Uptime monitors need to distinguish "up" from "up but drowning", so the
      // status word is public while the underlying counts are not.
      return Response.json(
        { ok: true, database: true, release, load: dbPool.status },
        { headers: healthHeaders },
      );
    }

    return Response.json(
      {
        ok: true,
        database: true,
        release,
        clashRoyaleApi: {
          configured: clashRoyaleApi.configured,
          provider: clashRoyaleApi.provider,
        },
        telegramCron: {
          protected: Boolean(process.env.TELEGRAM_CRON_SECRET || process.env.CRON_SECRET),
        },
        affiliateProgram: {
          configured: true,
          live: affiliateProgramLive(),
          rollout: affiliateRolloutMode(),
          canaryConfigured: affiliateRolloutMode() !== "canary" || affiliateCanaryFlexaIds().length >= 2,
          attributionDays: 30,
          commissionTomanPerMatch: 7000,
          personalMinimumPayoutToman: 200000,
          destinations: ["bank", "gaming_wallet"],
        },
        codArena: {
          configured: true,
          ...codArenaFinanceState(),
          regions: ["global", "garena"],
          modes: ["solo", "duo", "squad"],
          rewards: ["kill", "placement", "participation"],
          referralModel: "service_fee_percentage",
        },
        email: {
          configured: email.configured,
          provider: email.provider,
          requestedProvider: email.requestedProvider,
          sandboxSender: email.sandboxSender,
          from: email.from,
          smtpHost: email.smtpHost,
          appsScriptConfigured: email.appsScriptConfigured,
        },
        dbPool,
        paymentGateway: {
          provider: "cryptopayment",
          configured: paymentGateway.configured,
          live: paymentGateway.live,
          sandbox: paymentGateway.sandbox,
          merchantIdValid: paymentGateway.merchantIdValid,
          callbackConfigured: Boolean(paymentGateway.callbackBaseUrl),
        },
      },
      { headers: healthHeaders },
    );
  } catch {
    return unhealthy("DATABASE_CONNECTION_FAILED");
  }
}
