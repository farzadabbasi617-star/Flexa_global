import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEGRAM_CHANNEL_USERNAME,
  channelHandle,
  channelUrl,
  resolveChannelUsername,
} from "./telegram-channel";

/**
 * "@Flexa_games" was hardcoded as the channel fallback in six modules and
 * printed literally on the contact page. That channel does not exist —
 * Telegram getChat answers "chat not found" — so the contact link was dead and
 * the admin /poll command failed silently. The real channel is @Flexa_games
 * (title: "Flexa").
 *
 * Same shape as the bot-username bug: a plausible-looking literal that nobody
 * verified against the live service.
 */

describe("resolveChannelUsername", () => {
  it("defaults to the channel that actually exists", () => {
    expect(DEFAULT_TELEGRAM_CHANNEL_USERNAME).toBe("Flexa_games");
    expect(resolveChannelUsername(undefined)).toBe("Flexa_games");
    expect(resolveChannelUsername("")).toBe("Flexa_games");
  });

  it("accepts a full t.me URL", () => {
    expect(resolveChannelUsername("https://t.me/Some_Channel")).toBe("Some_Channel");
    expect(resolveChannelUsername("http://www.t.me/Some_Channel")).toBe("Some_Channel");
  });

  it("accepts a bare handle with or without @", () => {
    expect(resolveChannelUsername("@Some_Channel")).toBe("Some_Channel");
    expect(resolveChannelUsername("Some_Channel")).toBe("Some_Channel");
    expect(resolveChannelUsername("  @Some_Channel  ")).toBe("Some_Channel");
  });

  it("falls back on values Telegram could not accept", () => {
    for (const bad of ["ab", "has space", "bad!char", "x".repeat(33)]) {
      expect(resolveChannelUsername(bad), `should reject: ${bad}`).toBe(
        DEFAULT_TELEGRAM_CHANNEL_USERNAME
      );
    }
  });

  it("formats handles and URLs consistently", () => {
    expect(channelHandle()).toBe("@Flexa_games");
    expect(channelUrl()).toBe("https://t.me/Flexa_games");
    expect(channelUrl("@Other_Chan")).toBe("https://t.me/Other_Chan");
  });
});

describe("call sites", () => {
  const files = [
    "app/contact/page.tsx",
    "lib/telegram.ts",
    "app/api/telegram/webhook/config.ts",
    "app/api/telegram/webhook/membership.ts",
    "app/api/telegram/webhook/route.ts",
  ];

  it("no module hardcodes the non-existent channel", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(path.join(process.cwd(), "src", f), "utf8")
        // Strip comments: the helper documents the old value on purpose.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return src.includes("Flexa_games");
    });

    expect(offenders, "these still point at a channel that does not exist").toEqual([]);
  });

  it("deployment config does not override the resolver with a dead channel", () => {
    // The code was already correct, but render.yaml set TELEGRAM_CHANNEL_URL
    // to the non-existent @Flexa_games. Environment beats defaults, so the
    // live bot still showed a dead link. Config needs the same guard as code.
    const configs = ["render.yaml", ".env.example", "docs/RENDER_DEPLOY.md"];
    const offenders = configs.filter((file) => {
      const src = readFileSync(path.join(process.cwd(), file), "utf8")
        // Strip comment lines: they document the old value on purpose.
        .replace(/^\s*#.*$/gm, "");
      return src.includes("Flexa_games");
    });

    expect(
      offenders,
      "these set the bot's channel to one that does not exist",
    ).toEqual([]);
  });

  it("the contact page renders the channel from config, not a literal", () => {
    const src = readFileSync(path.join(process.cwd(), "src", "app/contact/page.tsx"), "utf8");
    expect(src).toContain("channelUrl(");
    expect(src).toContain("channelHandle(");
  });

  it("the admin poll command uses the resolver", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src", "app/api/telegram/webhook/route.ts"),
      "utf8"
    );
    // It previously read process.env.TELEGRAM_CHANNEL_ID || "@Flexa_games",
    // bypassing getTelegramChannelChatId() which derives the right value.
    expect(src).toContain("chat_id: getTelegramChannelChatId()");
  });
});
