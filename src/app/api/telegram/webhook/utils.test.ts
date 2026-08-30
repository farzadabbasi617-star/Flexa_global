import { describe, expect, it } from "vitest";
import {
  extractInviteReference,
  html,
  isValidFlexaId,
  normalizeGame,
  normalizeFlexaId,
} from "./utils";

describe("Telegram webhook utilities", () => {
  it("escapes dynamic values before Telegram HTML messages", () => {
    expect(html('<b>A&B</b>')).toBe("&lt;b&gt;A&amp;B&lt;/b&gt;");
  });

  it("normalizes Persian and English game aliases", () => {
    expect(normalizeGame("کالاف موبایل")).toBe("cod_mobile");
    expect(normalizeGame("Clash-Royale")).toBe("clash_royale");
  });

  it("normalizes and validates a Flexa ID", () => {
    expect(normalizeFlexaId(" flx-۱۲۳۴ ")).toBe("FLX-1234");
    expect(isValidFlexaId("FLX-1234")).toBe(true);
    expect(isValidFlexaId("1234")).toBe(false);
  });

  it("extracts the friend link from Clash Royale's shared message", () => {
    const link = "https://link.clashroyale.com/invite/friend/fa?tag=%23ABC123&token=XYZ-789&platform=android";
    expect(extractInviteReference(`برای افزودن من به‌عنوان دوست روی این پیوند بزن! ${link}،`))
      .toBe(link);
  });
});
