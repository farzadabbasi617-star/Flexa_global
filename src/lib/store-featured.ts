/**
 * Rules for the storefront hero carousel.
 *
 * A promotion is chargeable, so "is this slot live right now" has to have one
 * answer that the public API, the admin panel and any future billing all agree
 * on. Keeping it here rather than inline in a query means it can be tested
 * directly, and a change cannot land in one place and not the other.
 */
export const FEATURED_LIMIT = 8;

/** Longest a single placement may run, as a guard against a typo'd date. */
export const MAX_FEATURED_DAYS = 90;

export type FeaturedStatus = "none" | "pending_review" | "approved" | "rejected";

export type FeaturedListingLike = {
  featuredStatus?: FeaturedStatus | null;
  featuredUntil?: Date | string | null;
  /** Only a listing that is buyable belongs in the shop window. */
  status?: string | null;
  stock?: number | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Approval alone is not enough. The placement must also be unexpired, and the
 * listing itself must still be active and in stock — promoting a sold-out or
 * paused item wastes the slot and looks broken to a buyer who clicks it.
 */
export function isFeaturedLive(listing: FeaturedListingLike, now: Date = new Date()): boolean {
  if (listing.featuredStatus !== "approved") return false;

  const until = toDate(listing.featuredUntil);
  if (!until || until.getTime() <= now.getTime()) return false;

  if (listing.status && listing.status !== "active") return false;
  if (typeof listing.stock === "number" && listing.stock <= 0) return false;

  return true;
}

/**
 * Clamp an admin-entered duration. Rejecting instead of silently capping would
 * lose a paid placement over a typo, so this reports what it did.
 */
export function resolveFeaturedUntil(
  days: number,
  now: Date = new Date()
): { until: Date; clampedFrom: number | null } {
  const requested = Math.floor(Number(days));
  if (!Number.isFinite(requested) || requested < 1) {
    return { until: new Date(now.getTime() + 86_400_000), clampedFrom: requested || 0 };
  }

  const capped = Math.min(requested, MAX_FEATURED_DAYS);
  return {
    until: new Date(now.getTime() + capped * 86_400_000),
    clampedFrom: capped === requested ? null : requested,
  };
}

/**
 * Highest rank first, then the placement expiring soonest, so a slot that is
 * about to lapse still gets its remaining exposure rather than sitting last.
 * Ties fall back to id to keep the order stable between requests.
 */
export function compareFeatured(
  a: FeaturedListingLike & { featuredRank?: number | null; id?: string },
  b: FeaturedListingLike & { featuredRank?: number | null; id?: string }
): number {
  const rankDiff = (b.featuredRank ?? 0) - (a.featuredRank ?? 0);
  if (rankDiff !== 0) return rankDiff;

  const aUntil = toDate(a.featuredUntil)?.getTime() ?? Infinity;
  const bUntil = toDate(b.featuredUntil)?.getTime() ?? Infinity;
  if (aUntil !== bUntil) return aUntil - bUntil;

  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}
