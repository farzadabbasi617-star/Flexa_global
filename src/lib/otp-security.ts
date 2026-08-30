import crypto from "crypto";
import { normalizeDatabaseUrl } from "@/lib/database-url";

type OtpEnvironment = {
  OTP_TOKEN_PEPPER?: string;
  ADMIN_SETUP_SECRET?: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
};

/**
 * Returns a stable server-side key for hashing short-lived OTP values.
 *
 * Production should always set OTP_TOKEN_PEPPER. ADMIN_SETUP_SECRET remains a
 * backwards-compatible fallback. Existing Render services without either value
 * derive an application-specific key from DATABASE_URL instead of using a
 * universal hard-coded production pepper. Rotating the database credential may
 * invalidate only OTPs that were already pending (maximum lifetime: 15 min).
 */
export function getOtpTokenPepper(env: OtpEnvironment = process.env) {
  const dedicated = env.OTP_TOKEN_PEPPER?.trim();
  if (dedicated) return dedicated;

  const bootstrap = env.ADMIN_SETUP_SECRET?.trim();
  if (bootstrap) return bootstrap;

  const databaseUrl = normalizeDatabaseUrl(env.DATABASE_URL);
  if (env.NODE_ENV === "production") {
    if (!databaseUrl) {
      throw new Error("OTP_TOKEN_PEPPER is required when DATABASE_URL is unavailable in production");
    }
    return crypto
      .createHash("sha256")
      .update(`flexa:otp:database-fallback:v1:${databaseUrl}`)
      .digest("hex");
  }

  return "flexa-development-only-otp-pepper-v1";
}
