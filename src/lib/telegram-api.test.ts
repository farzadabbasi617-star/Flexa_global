import { afterEach, describe, expect, it, vi } from "vitest";
import { telegramApi } from "@/lib/telegram-api";

describe("telegramApi", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails safely when the bot token is not configured", async () => {
    vi.stubEnv("BOT_TOKEN", "");

    const result = await telegramApi("getMe");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.description).toBe("BOT_TOKEN is missing");
  });
});
