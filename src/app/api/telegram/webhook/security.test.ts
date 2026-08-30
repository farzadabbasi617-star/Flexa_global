import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { timingSafeEqualText, validateWebhookSecret } from "./security";

describe("Telegram webhook security", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("compares equal secrets and rejects unequal values", () => {
    expect(timingSafeEqualText("secret", "secret")).toBe(true);
    expect(timingSafeEqualText("secret", "other")).toBe(false);
    expect(timingSafeEqualText("short", "much-longer")).toBe(false);
  });

  it("accepts the configured Telegram secret header", () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
    const request = new NextRequest("https://example.test/api/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": "test-secret" },
    });
    expect(validateWebhookSecret(request).ok).toBe(true);
  });

  it("rejects a wrong Telegram secret header", () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
    const request = new NextRequest("https://example.test/api/telegram/webhook", {
      headers: { "x-telegram-bot-api-secret-token": "wrong" },
    });
    const result = validateWebhookSecret(request);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });
});
