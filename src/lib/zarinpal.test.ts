import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getCryptoPaymentConfiguration, startPayUrl, cryptopaymentErrorMessage } from "@/lib/cryptopayment";

const VALID_MERCHANT = "1344b5d4-0048-11e8-94db-005056a205be";

function setEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("cryptopayment configuration", () => {
  const original = { ...process.env };

  beforeEach(() => {
    setEnv({
      ZARINPAL_MERCHANT_ID: undefined,
      ZARINPAL_LIVE: undefined,
      ZARINPAL_SANDBOX: undefined,
      PAYMENT_CALLBACK_BASE_URL: undefined,
      NEXT_PUBLIC_SITE_URL: undefined,
    });
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("is unconfigured when no merchant id is present", () => {
    expect(getCryptoPaymentConfiguration().configured).toBe(false);
    expect(getCryptoPaymentConfiguration().live).toBe(false);
  });

  it("rejects a merchant id that is not a 36-character uuid", () => {
    setEnv({ ZARINPAL_MERCHANT_ID: "ZP.0000000", PAYMENT_CALLBACK_BASE_URL: "https://www.flexa1.ir" });
    const config = getCryptoPaymentConfiguration();
    expect(config.merchantIdValid).toBe(false);
    expect(config.configured).toBe(false);
  });

  it("accepts a valid merchant id with an https callback base", () => {
    setEnv({ ZARINPAL_MERCHANT_ID: VALID_MERCHANT, PAYMENT_CALLBACK_BASE_URL: "https://www.flexa1.ir" });
    const config = getCryptoPaymentConfiguration();
    expect(config.merchantIdValid).toBe(true);
    expect(config.configured).toBe(true);
  });

  it("refuses a non-https callback base", () => {
    setEnv({ ZARINPAL_MERCHANT_ID: VALID_MERCHANT, PAYMENT_CALLBACK_BASE_URL: "http://www.flexa1.ir" });
    expect(getCryptoPaymentConfiguration().configured).toBe(false);
  });

  it("strips a trailing slash from the callback base", () => {
    setEnv({ ZARINPAL_MERCHANT_ID: VALID_MERCHANT, PAYMENT_CALLBACK_BASE_URL: "https://www.flexa1.ir/" });
    expect(getCryptoPaymentConfiguration().callbackBaseUrl).toBe("https://www.flexa1.ir");
  });

  it("stays off when configured but ZARINPAL_LIVE is not set", () => {
    setEnv({ ZARINPAL_MERCHANT_ID: VALID_MERCHANT, PAYMENT_CALLBACK_BASE_URL: "https://www.flexa1.ir" });
    const config = getCryptoPaymentConfiguration();
    expect(config.configured).toBe(true);
    expect(config.live).toBe(false);
  });

  it("goes live only when the merchant id is valid and ZARINPAL_LIVE is true", () => {
    setEnv({
      ZARINPAL_MERCHANT_ID: VALID_MERCHANT,
      PAYMENT_CALLBACK_BASE_URL: "https://www.flexa1.ir",
      ZARINPAL_LIVE: "true",
    });
    expect(getCryptoPaymentConfiguration().live).toBe(true);
  });

  it("never goes live on a bad merchant id even when ZARINPAL_LIVE is true", () => {
    setEnv({
      ZARINPAL_MERCHANT_ID: "not-a-uuid",
      PAYMENT_CALLBACK_BASE_URL: "https://www.flexa1.ir",
      ZARINPAL_LIVE: "true",
    });
    expect(getCryptoPaymentConfiguration().live).toBe(false);
  });

  it("falls back to NEXT_PUBLIC_SITE_URL for the callback base", () => {
    setEnv({ ZARINPAL_MERCHANT_ID: VALID_MERCHANT, NEXT_PUBLIC_SITE_URL: "https://www.flexa1.ir" });
    expect(getCryptoPaymentConfiguration().configured).toBe(true);
  });
});

describe("startPayUrl", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("builds the production StartPay url", () => {
    setEnv({ ZARINPAL_SANDBOX: undefined });
    expect(startPayUrl("A00000000000000000000000000000123456")).toBe(
      "https://payment.cryptopayment.com/pg/StartPay/A00000000000000000000000000000123456"
    );
  });

  it("builds the sandbox StartPay url when sandbox is enabled", () => {
    setEnv({ ZARINPAL_SANDBOX: "true" });
    expect(startPayUrl("A00000000000000000000000000000123456")).toContain("sandbox.cryptopayment.com");
  });
});

describe("cryptopaymentErrorMessage", () => {
  it("maps documented gateway codes to Persian messages", () => {
    expect(cryptopaymentErrorMessage(-11)).toContain("مرچنت کد");
    expect(cryptopaymentErrorMessage(-33)).toContain("مطابقت ندارد");
    expect(cryptopaymentErrorMessage(101)).toContain("قبلاً تأیید");
  });

  it("falls back for unknown codes without leaking gateway internals", () => {
    expect(cryptopaymentErrorMessage(-999)).toBe("پرداخت انجام نشد (کد -999).");
  });

  it("handles a missing code", () => {
    expect(cryptopaymentErrorMessage(undefined)).toContain("ارتباط با درگاه");
  });
});

describe("cryptopaymentErrorMessage with validation details", () => {
  it("names the rejected field for a -9 validation error", () => {
    const message = cryptopaymentErrorMessage(-9, {
      validations: [{ "metadata.mobile": "The metadata.mobile format is invalid." }],
    });
    expect(message).toContain("metadata.mobile");
  });

  it("supports the {field, message} validation shape", () => {
    const message = cryptopaymentErrorMessage(-9, {
      validations: [{ field: "callback_url", message: "invalid" }],
    });
    expect(message).toContain("callback_url");
  });

  it("falls back to the generic -9 text when no validations are present", () => {
    expect(cryptopaymentErrorMessage(-9, { validations: [] })).toContain("-9");
  });

  it("ignores malformed validation payloads", () => {
    expect(cryptopaymentErrorMessage(-9, { validations: "nope" as unknown })).toContain("-9");
  });
});
