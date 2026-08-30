import { describe, expect, it } from "vitest";
import { getOtpTokenPepper } from "@/lib/otp-security";

describe("OTP token pepper", () => {
  it("prefers a dedicated pepper and keeps the admin secret as a fallback", () => {
    expect(getOtpTokenPepper({
      NODE_ENV: "production",
      OTP_TOKEN_PEPPER: " dedicated-secret ",
      ADMIN_SETUP_SECRET: "admin-secret",
      DATABASE_URL: "postgresql://user:pass@host/db",
    })).toBe("dedicated-secret");

    expect(getOtpTokenPepper({
      NODE_ENV: "production",
      ADMIN_SETUP_SECRET: " admin-secret ",
      DATABASE_URL: "postgresql://user:pass@host/db",
    })).toBe("admin-secret");
  });

  it("uses a stable per-deployment fallback instead of a universal production key", () => {
    const first = getOtpTokenPepper({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:first@host/db?sslmode=require",
    });
    const sameNormalizedUrl = getOtpTokenPepper({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:first@host/db?sslmode=verify-full",
    });
    const second = getOtpTokenPepper({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:second@host/db?sslmode=verify-full",
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(sameNormalizedUrl);
    expect(first).not.toBe(second);
  });

  it("fails closed in production when no stable secret source exists", () => {
    expect(() => getOtpTokenPepper({ NODE_ENV: "production" }))
      .toThrow(/OTP_TOKEN_PEPPER/);
  });

  it("uses an explicit development-only fallback outside production", () => {
    expect(getOtpTokenPepper({ NODE_ENV: "test" }))
      .toBe("flexa-development-only-otp-pepper-v1");
  });
});
