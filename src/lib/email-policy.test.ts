import { describe, expect, it } from "vitest";
import { EMAIL_OTP_RESEND_COOLDOWN_SECONDS, EMAIL_OTP_TTL_MINUTES } from "@/lib/email-policy";

describe("email OTP policy", () => {
  it("uses a two-minute resend cooldown", () => {
    expect(EMAIL_OTP_RESEND_COOLDOWN_SECONDS).toBe(120);
  });

  it("keeps OTP validity at fifteen minutes", () => {
    expect(EMAIL_OTP_TTL_MINUTES).toBe(15);
  });
});
