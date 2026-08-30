import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEGRAM_BOT_USERNAME,
  botDeepLink,
  resolveBotUsername,
} from "./telegram-bot-username";

/**
 * Production had TELEGRAM_BOT_USERNAME and NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
 * both set to the literal "YourBotUsername". The old pattern
 * (`process.env.X || "FlexaTournamentBot"`) only falls back on an *empty*
 * value, so the placeholder shipped: the 1V1 button linked to
 * https://t.me/YourBotUsername?start=clash and sent paying users to an
 * unrelated bot.
 */

describe("resolveBotUsername", () => {
  it("rejects the exact placeholder that reached production", () => {
    expect(resolveBotUsername("YourBotUsername")).toBe(DEFAULT_TELEGRAM_BOT_USERNAME);
  });

  it("rejects other common template values", () => {
    for (const bad of [
      "yourbot",
      "your_bot",
      "my_bot",
      "mybot",
      "bot_username",
      "BOT_USERNAME",
      "username",
      "changeme",
      "TODO",
      "xxxxx",
      "<your-bot>",
    ]) {
      expect(resolveBotUsername(bad), `should reject: ${bad}`).toBe(
        DEFAULT_TELEGRAM_BOT_USERNAME
      );
    }
  });

  it("falls back when unset, empty or whitespace", () => {
    for (const bad of [undefined, null, "", "   "]) {
      expect(resolveBotUsername(bad as string | null | undefined)).toBe(
        DEFAULT_TELEGRAM_BOT_USERNAME
      );
    }
  });

  it("rejects values Telegram itself could not accept", () => {
    // Too short, illegal characters, or too long.
    for (const bad of ["bot", "a b c", "bad-name!", "x".repeat(33)]) {
      expect(resolveBotUsername(bad), `should reject: ${bad}`).toBe(
        DEFAULT_TELEGRAM_BOT_USERNAME
      );
    }
  });

  it("accepts a genuine username and strips a leading @", () => {
    expect(resolveBotUsername("FlexaTournamentBot")).toBe("FlexaTournamentBot");
    expect(resolveBotUsername("@FlexaTournamentBot")).toBe("FlexaTournamentBot");
    expect(resolveBotUsername("  FlexaTournamentBot  ")).toBe("FlexaTournamentBot");
    // A different, legitimately configured bot must be honoured.
    expect(resolveBotUsername("Flexa_Support_Bot")).toBe("Flexa_Support_Bot");
  });
});

describe("botDeepLink", () => {
  it("builds a correct start link", () => {
    expect(botDeepLink("clash", "FlexaTournamentBot")).toBe(
      "https://t.me/FlexaTournamentBot?start=clash"
    );
  });

  it("never emits a placeholder link", () => {
    expect(botDeepLink("clash", "YourBotUsername")).toBe(
      `https://t.me/${DEFAULT_TELEGRAM_BOT_USERNAME}?start=clash`
    );
  });

  it("omits the query string when there is no payload", () => {
    expect(botDeepLink(undefined, "FlexaTournamentBot")).toBe(
      "https://t.me/FlexaTournamentBot"
    );
  });

  it("encodes payloads that contain URL-unsafe characters", () => {
    expect(botDeepLink("duel a&b", "FlexaTournamentBot")).toBe(
      "https://t.me/FlexaTournamentBot?start=duel%20a%26b"
    );
  });
});

describe("call sites", () => {
  it("no page or route builds a t.me bot link from the raw env var", () => {
    // The `|| "fallback"` idiom is what let the placeholder through. Every
    // caller must go through the guard instead.
    const files = [
      "app/tournaments/[id]/page.tsx",
      "app/cod-arena/[id]/page.tsx",
      "app/api/registrations/route.ts",
      "app/api/telegram/webhook/route.ts",
      "app/api/telegram/webhook/commands/clash-friend-duel.ts",
      "lib/affiliate-service.ts",
    ];

    const offenders = files.filter((f) => {
      const src = readFileSync(path.join(process.cwd(), "src", f), "utf8");
      return /TELEGRAM_BOT_USERNAME\s*\|\|/.test(src);
    });

    expect(offenders, "these still fall back only on an empty value").toEqual([]);
  });
});
