import { describe, expect, it } from "vitest";
import {
  normalizeCodBannerUrl,
  normalizeCodFaq,
  normalizeCodMatchSettings,
} from "./cod-room-policy";

describe("room banner URLs", () => {
  it("accepts our own bundled key art", () => {
    expect(normalizeCodBannerUrl("/cod/banner-rebirth.jpg")).toBe("/cod/banner-rebirth.jpg");
  });

  it("accepts a remote HTTPS banner", () => {
    expect(normalizeCodBannerUrl("https://cdn.example.com/room.jpg")).toBe("https://cdn.example.com/room.jpg");
  });

  it("treats an empty value as no banner", () => {
    expect(normalizeCodBannerUrl("")).toBeNull();
    expect(normalizeCodBannerUrl(null)).toBeNull();
    expect(normalizeCodBannerUrl("   ")).toBeNull();
  });

  it("rejects a javascript: URL", () => {
    // The banner is rendered as an <img src>, so a scheme-bearing string must never
    // survive normalization.
    expect(() => normalizeCodBannerUrl("javascript:alert(1)")).toThrow();
  });

  it("rejects plain HTTP and protocol-relative URLs", () => {
    expect(() => normalizeCodBannerUrl("http://cdn.example.com/room.jpg")).toThrow(/HTTPS/);
    expect(() => normalizeCodBannerUrl("//evil.example.com/room.jpg")).toThrow();
  });
});

describe("structured match settings", () => {
  it("keeps the recognised lobby toggles", () => {
    const settings = normalizeCodMatchSettings({
      revive: "auto",
      limitedAmmo: false,
      zoneSpeed: "fast",
      doubleGroundLoot: true,
      vehiclesEnabled: false,
    });
    expect(settings).toEqual({
      revive: "auto",
      limitedAmmo: false,
      zoneSpeed: "fast",
      doubleGroundLoot: true,
      vehiclesEnabled: false,
    });
  });

  it("nulls out values it does not recognise instead of trusting them", () => {
    const settings = normalizeCodMatchSettings({ revive: "sometimes", zoneSpeed: "warp", limitedAmmo: "yes" });
    expect(settings.revive).toBeNull();
    expect(settings.zoneSpeed).toBeNull();
    expect(settings.limitedAmmo).toBeNull();
  });

  it("survives a completely absent settings object", () => {
    expect(normalizeCodMatchSettings(undefined).revive).toBeNull();
    expect(normalizeCodMatchSettings("nonsense").zoneSpeed).toBeNull();
  });
});

describe("room FAQ", () => {
  it("keeps well-formed entries", () => {
    const faq = normalizeCodFaq([
      { question: "قوانین بازی چگونه است؟", answer: "استفاده از آیتم self_revive ممنوع است." },
    ]);
    expect(faq).toHaveLength(1);
    expect(faq[0].question).toBe("قوانین بازی چگونه است؟");
  });

  it("drops entries missing a question or an answer", () => {
    expect(normalizeCodFaq([
      { question: "", answer: "x" },
      { question: "y", answer: "  " },
      { question: "ok", answer: "fine" },
    ])).toHaveLength(1);
  });

  it("caps the list so one room cannot bloat every payload", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ question: `q${index}`, answer: `a${index}` }));
    expect(normalizeCodFaq(many)).toHaveLength(20);
  });

  it("returns an empty list for non-array input", () => {
    expect(normalizeCodFaq(null)).toEqual([]);
    expect(normalizeCodFaq({ question: "x", answer: "y" })).toEqual([]);
  });
});
