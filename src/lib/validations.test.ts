import { describe, expect, it } from "vitest";
import {
  RegisterSchema,
  EmailOtpRequestSchema,
  EmailOtpVerifySchema,
  PasswordResetRequestSchema,
  PasswordResetConfirmSchema,
} from "./validations";

const validBase = {
  username: "ShadowGamer",
  phoneNumber: "09123456789",
  email: "player@example.com",
  password: "Secret!12345",
  firstName: "Shadow",
  lastName: "Gamer",
  // Age-gate fields (see src/lib/age-gate.ts). RegisterSchema requires them
  // so paid flows (wallet top-up, paid tournaments) have the data they need.
  birthDate: "2000-05-14",
  nationalId: "0019553412", // valid Iranian NID checksum (test fixture only)
  termsAccepted: true,
  riskAndAgeAccepted: true,
};

describe("RegisterSchema", () => {
  it("accepts a fully valid registration payload", () => {
    const result = RegisterSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("player@example.com");
      expect(result.data.phoneNumber).toBe("09123456789");
    }
  });

  it("rejects registration when email is missing (email is now required)", () => {
    const { email, ...withoutEmail } = validBase;
    void email;
    const result = RegisterSchema.safeParse(withoutEmail);
    expect(result.success).toBe(false);
    // Should surface our Persian "required" message, not zod's generic
    // "expected string, received undefined".
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ایمیل الزامی است");
    }
  });

  it("rejects registration when email is an empty string", () => {
    const result = RegisterSchema.safeParse({ ...validBase, email: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email format", () => {
    const result = RegisterSchema.safeParse({ ...validBase, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("still requires a valid mobile number (unchanged behavior)", () => {
    const result = RegisterSchema.safeParse({ ...validBase, phoneNumber: "12345" });
    expect(result.success).toBe(false);
  });

  it("lowercases and trims the email", () => {
    const result = RegisterSchema.safeParse({ ...validBase, email: "  Player@Example.COM  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("player@example.com");
    }
  });

  // ---- Age-gate fields ----
  it("rejects registration when birthDate is missing", () => {
    const { birthDate, ...withoutBirth } = validBase;
    void birthDate;
    const result = RegisterSchema.safeParse(withoutBirth);
    expect(result.success).toBe(false);
  });

  it("rejects registration when birthDate is not YYYY-MM-DD", () => {
    const result = RegisterSchema.safeParse({ ...validBase, birthDate: "14/05/2000" });
    expect(result.success).toBe(false);
  });

  it("rejects registration when birthDate is impossible (Feb 30)", () => {
    const result = RegisterSchema.safeParse({ ...validBase, birthDate: "2000-02-30" });
    expect(result.success).toBe(false);
  });

  it("rejects registration when birthDate is in the future", () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const iso = future.toISOString().slice(0, 10);
    const result = RegisterSchema.safeParse({ ...validBase, birthDate: iso });
    expect(result.success).toBe(false);
  });

  it("rejects registration when nationalId is missing", () => {
    const { nationalId, ...withoutNid } = validBase;
    void nationalId;
    const result = RegisterSchema.safeParse(withoutNid);
    expect(result.success).toBe(false);
  });

  it("rejects registration with an invalid nationalId checksum", () => {
    const result = RegisterSchema.safeParse({ ...validBase, nationalId: "1234567890" });
    expect(result.success).toBe(false);
  });

  it("rejects registration with an all-same-digit nationalId (0000000000)", () => {
    const result = RegisterSchema.safeParse({ ...validBase, nationalId: "0000000000" });
    expect(result.success).toBe(false);
  });

  it("accepts under-18 birthDate at registration (age enforcement happens at the paid-action layer, not here)", () => {
    const result = RegisterSchema.safeParse({ ...validBase, birthDate: "2015-01-01" });
    // Signup is not itself age-gated — only paid flows are. So the schema
    // should accept the payload; the runtime age-gate in
    // src/lib/age-gate.ts is what blocks paid tournaments and top-ups.
    expect(result.success).toBe(true);
  });
});

describe("EmailOtpRequestSchema", () => {
  it("accepts a valid email", () => {
    expect(EmailOtpRequestSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });

  it("rejects a missing email", () => {
    expect(EmailOtpRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("EmailOtpVerifySchema", () => {
  it("accepts a 6-digit code", () => {
    const result = EmailOtpVerifySchema.safeParse({ email: "a@b.com", code: "123456" });
    expect(result.success).toBe(true);
  });

  it("rejects a code that isn't exactly 6 digits", () => {
    expect(EmailOtpVerifySchema.safeParse({ email: "a@b.com", code: "12345" }).success).toBe(false);
    expect(EmailOtpVerifySchema.safeParse({ email: "a@b.com", code: "1234567" }).success).toBe(false);
    expect(EmailOtpVerifySchema.safeParse({ email: "a@b.com", code: "abcdef" }).success).toBe(false);
  });
});

describe("Password reset schemas", () => {
  it("normalizes a valid reset email", () => {
    const result = PasswordResetRequestSchema.safeParse({ email: "  Player@Example.COM " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("player@example.com");
  });

  it("accepts a valid code and strong new password", () => {
    const result = PasswordResetConfirmSchema.safeParse({
      email: "player@example.com",
      code: "123456",
      password: "NewSecret!123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects weak passwords and malformed codes", () => {
    expect(PasswordResetConfirmSchema.safeParse({
      email: "player@example.com",
      code: "12345",
      password: "weak",
    }).success).toBe(false);
  });
});
