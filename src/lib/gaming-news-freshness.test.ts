import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_NEWS_MAX_AGE_HOURS,
  isRecentNewsItem,
  newsMaxAgeHours,
} from "./gaming-news-generator";

/**
 * The Hall of Fame auto-news stopped publishing while the cron kept reporting
 * success. Discovery worked (11 links found per run) but every candidate was
 * dropped by a hard-coded 96-hour freshness window: first-party studios simply
 * do not post daily. Measured against the live Supercell index, the six newest
 * Clash Royale posts were 293h, 486h, 487h, 601h, 1323h and 1325h old.
 */

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function itemAgedHours(hours: number) {
  return {
    title: "Official post",
    link: "https://supercell.com/en/games/clashroyale/blog/release-notes/x/",
    source: "Supercell",
    pubDate: new Date(Date.now() - hours * 3_600_000).toISOString(),
    game: "clash_royale" as const,
  };
}

describe("newsMaxAgeHours", () => {
  it("defaults to a window that survives a normal quiet week", () => {
    delete process.env.GAMING_NEWS_MAX_AGE_HOURS;
    expect(newsMaxAgeHours()).toBe(DEFAULT_NEWS_MAX_AGE_HOURS);
    // The old 96h value is exactly what starved the feed.
    expect(newsMaxAgeHours()).toBeGreaterThan(96);
  });

  it("is configurable", () => {
    process.env.GAMING_NEWS_MAX_AGE_HOURS = "120";
    expect(newsMaxAgeHours()).toBe(120);
  });

  it("clamps nonsense instead of resurfacing year-old posts", () => {
    process.env.GAMING_NEWS_MAX_AGE_HOURS = "999999";
    expect(newsMaxAgeHours()).toBe(2160);

    process.env.GAMING_NEWS_MAX_AGE_HOURS = "1";
    expect(newsMaxAgeHours()).toBe(24);

    for (const bad of ["", "abc", "-5", "0"]) {
      process.env.GAMING_NEWS_MAX_AGE_HOURS = bad;
      expect(newsMaxAgeHours(), `value: ${bad}`).toBe(DEFAULT_NEWS_MAX_AGE_HOURS);
    }
  });
});

describe("isRecentNewsItem", () => {
  it("accepts the real-world posting cadence that used to be rejected", () => {
    delete process.env.GAMING_NEWS_MAX_AGE_HOURS;
    // 293h was the newest Supercell post at the time of the outage.
    expect(isRecentNewsItem(itemAgedHours(293))).toBe(true);
    expect(isRecentNewsItem(itemAgedHours(2))).toBe(true);
  });

  it("still rejects genuinely stale posts", () => {
    delete process.env.GAMING_NEWS_MAX_AGE_HOURS;
    expect(isRecentNewsItem(itemAgedHours(1325))).toBe(false);
  });

  it("rejects undated items — a date is required to judge freshness", () => {
    expect(isRecentNewsItem({ ...itemAgedHours(1), pubDate: null })).toBe(false);
  });

  it("rejects items dated in the future beyond clock skew", () => {
    expect(isRecentNewsItem(itemAgedHours(-48))).toBe(false);
    // Small skew stays acceptable.
    expect(isRecentNewsItem(itemAgedHours(-0.25))).toBe(true);
  });

  it("honours an explicit window over the environment default", () => {
    expect(isRecentNewsItem(itemAgedHours(200), 96)).toBe(false);
    expect(isRecentNewsItem(itemAgedHours(200), 336)).toBe(true);
  });
});
