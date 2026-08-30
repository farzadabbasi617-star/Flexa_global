import { describe, expect, it } from "vitest";
import {
  shouldRetryTelegramUpdate,
  telegramRetryDelaySeconds,
} from "@/lib/telegram-reliability-policy";

describe("Telegram reliability policy", () => {
  it("uses capped exponential retry backoff", () => {
    expect(telegramRetryDelaySeconds(1)).toBe(5);
    expect(telegramRetryDelaySeconds(2)).toBe(10);
    expect(telegramRetryDelaySeconds(4)).toBe(40);
    expect(telegramRetryDelaySeconds(99)).toBe(3600);
  });

  it("retries only bounded non-degraded webhook claims", () => {
    expect(shouldRetryTelegramUpdate(1)).toBe(true);
    expect(shouldRetryTelegramUpdate(5)).toBe(false);
    expect(shouldRetryTelegramUpdate(1, true)).toBe(false);
  });
});
