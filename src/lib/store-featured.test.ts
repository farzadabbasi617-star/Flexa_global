import { describe, expect, it } from "vitest";
import {
  MAX_FEATURED_DAYS,
  compareFeatured,
  isFeaturedLive,
  resolveFeaturedUntil,
} from "./store-featured";

const NOW = new Date("2026-08-20T12:00:00Z");
const future = new Date("2026-08-27T12:00:00Z");
const past = new Date("2026-08-13T12:00:00Z");

const live = {
  featuredStatus: "approved" as const,
  featuredUntil: future,
  status: "active",
  stock: 3,
};

describe("isFeaturedLive", () => {
  it("shows an approved, unexpired, in-stock listing", () => {
    expect(isFeaturedLive(live, NOW)).toBe(true);
  });

  // Expiry is data, not a cron job: a lapsed placement must stop showing even
  // if no cleanup task has run.
  it("hides a placement whose window has passed", () => {
    expect(isFeaturedLive({ ...live, featuredUntil: past }, NOW)).toBe(false);
  });

  it("hides a placement expiring exactly now", () => {
    expect(isFeaturedLive({ ...live, featuredUntil: NOW }, NOW)).toBe(false);
  });

  it("hides anything not approved", () => {
    for (const featuredStatus of ["none", "pending_review", "rejected"] as const) {
      expect(isFeaturedLive({ ...live, featuredStatus }, NOW)).toBe(false);
    }
  });

  // Paying for promotion must not bypass review.
  it("does not treat a pending request as live", () => {
    expect(isFeaturedLive({ ...live, featuredStatus: "pending_review" }, NOW)).toBe(false);
  });

  // A promoted item that cannot be bought wastes the slot and frustrates the
  // buyer who clicks it.
  it("hides a sold-out listing", () => {
    expect(isFeaturedLive({ ...live, stock: 0 }, NOW)).toBe(false);
  });

  it("hides a listing that is no longer active", () => {
    for (const status of ["paused", "archived", "pending_review", "rejected"]) {
      expect(isFeaturedLive({ ...live, status }, NOW)).toBe(false);
    }
  });

  it("handles a missing or malformed date without throwing", () => {
    expect(isFeaturedLive({ ...live, featuredUntil: null }, NOW)).toBe(false);
    expect(isFeaturedLive({ ...live, featuredUntil: "not-a-date" }, NOW)).toBe(false);
  });

  it("accepts an ISO string, which is what JSON carries", () => {
    expect(isFeaturedLive({ ...live, featuredUntil: future.toISOString() }, NOW)).toBe(true);
  });
});

describe("resolveFeaturedUntil", () => {
  it("adds the requested number of days", () => {
    const { until, clampedFrom } = resolveFeaturedUntil(7, NOW);
    expect(until.toISOString()).toBe("2026-08-27T12:00:00.000Z");
    expect(clampedFrom).toBeNull();
  });

  // A typo'd 3650 should not hand out a decade of front-page placement, but it
  // also should not silently vanish -- the caller is told it was capped.
  it("caps an over-long window and reports it", () => {
    const { until, clampedFrom } = resolveFeaturedUntil(3650, NOW);
    expect(clampedFrom).toBe(3650);
    const days = (until.getTime() - NOW.getTime()) / 86_400_000;
    expect(days).toBe(MAX_FEATURED_DAYS);
  });

  it("falls back to one day for zero, negative or junk input", () => {
    for (const value of [0, -5, Number.NaN]) {
      const { until } = resolveFeaturedUntil(value, NOW);
      expect(until.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });
});

describe("compareFeatured", () => {
  it("puts the higher rank first", () => {
    const items = [
      { id: "a", featuredRank: 1, featuredUntil: future },
      { id: "b", featuredRank: 9, featuredUntil: future },
    ];
    expect(items.sort(compareFeatured)[0].id).toBe("b");
  });

  it("shows the soonest-expiring first at equal rank", () => {
    const soon = new Date("2026-08-21T12:00:00Z");
    const items = [
      { id: "a", featuredRank: 5, featuredUntil: future },
      { id: "b", featuredRank: 5, featuredUntil: soon },
    ];
    expect(items.sort(compareFeatured)[0].id).toBe("b");
  });

  it("is stable when rank and expiry match", () => {
    const items = [
      { id: "b", featuredRank: 5, featuredUntil: future },
      { id: "a", featuredRank: 5, featuredUntil: future },
    ];
    expect(items.sort(compareFeatured).map((i) => i.id)).toEqual(["a", "b"]);
  });
});
