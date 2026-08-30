import { afterEach, describe, expect, it, vi } from "vitest";
import { sign } from "@tma.js/init-data-node";
import {
  telegramInitDataTtlSeconds,
  validateTelegramMiniAppInitData,
} from "@/lib/telegram-mini-app-auth";

const BOT_TOKEN = "123456789:TEST_TOKEN_FOR_UNIT_TESTS";
const TELEGRAM_USER = {
  id: 123456789,
  first_name: "Test",
  username: "flexa_test",
};

describe("Telegram Mini App initData", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a freshly signed payload", () => {
    const initData = sign({ user: TELEGRAM_USER }, BOT_TOKEN, new Date());

    const user = validateTelegramMiniAppInitData(initData, BOT_TOKEN, 3600);

    expect(user.id).toBe(TELEGRAM_USER.id);
    expect(user.username).toBe(TELEGRAM_USER.username);
  });

  it("rejects a tampered payload", () => {
    const initData = sign({ user: TELEGRAM_USER }, BOT_TOKEN, new Date());
    const tampered = initData.replace("flexa_test", "attacker");

    expect(() => validateTelegramMiniAppInitData(tampered, BOT_TOKEN, 3600)).toThrow();
  });

  it("rejects an expired payload to prevent replay", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const initData = sign({ user: TELEGRAM_USER }, BOT_TOKEN, twoHoursAgo);

    expect(() => validateTelegramMiniAppInitData(initData, BOT_TOKEN, 3600)).toThrow();
  });

  it("clamps an unsafe configured lifetime", () => {
    vi.stubEnv("TELEGRAM_INIT_DATA_TTL_SECONDS", "999999999");
    expect(telegramInitDataTtlSeconds()).toBe(24 * 60 * 60);
  });
});
