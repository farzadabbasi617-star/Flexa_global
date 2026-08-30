// Seller reputation: tier + tiered commission based on completed sales and rating.
// Inspired by marketplaces like SubGame where higher-trust sellers pay lower fees.

import { db } from "@/db";
import { storeOrders, sellerReviews } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

export type SellerTier = "new" | "bronze" | "silver" | "gold";

export interface SellerStats {
  completedSales: number;
  avgRating: number; // 0 when no reviews
  reviewCount: number;
  tier: SellerTier;
  feeBps: number; // platform commission in basis points for this tier
}

export const TIER_LABELS: Record<SellerTier, string> = {
  new: "تازه‌وارد",
  bronze: "برنزی",
  silver: "نقره‌ای",
  gold: "طلایی",
};

// Tier thresholds (completed sales) and their commission (basis points).
// Higher trust => lower fee. Defaults can be tuned later.
const TIER_FEE_BPS: Record<SellerTier, number> = {
  new: 1000, // 10%
  bronze: 800, // 8%
  silver: 650, // 6.5%
  gold: 500, // 5%
};

export function tierFor(completedSales: number, avgRating: number): SellerTier {
  if (completedSales >= 50 && avgRating >= 4.5) return "gold";
  if (completedSales >= 20 && avgRating >= 4.0) return "silver";
  if (completedSales >= 5) return "bronze";
  return "new";
}

export function feeBpsForTier(tier: SellerTier): number {
  return TIER_FEE_BPS[tier];
}

/** Compute a seller's live stats from completed orders + reviews. */
export async function getSellerStats(sellerId: string): Promise<SellerStats> {
  const [salesRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(storeOrders)
    .where(and(eq(storeOrders.sellerId, sellerId), eq(storeOrders.status, "completed")));

  const [reviewRow] = await db
    .select({
      c: sql<number>`count(*)::int`,
      avg: sql<number>`coalesce(avg(${sellerReviews.rating}), 0)::float`,
    })
    .from(sellerReviews)
    .where(eq(sellerReviews.sellerId, sellerId));

  const completedSales = salesRow?.c ?? 0;
  const reviewCount = reviewRow?.c ?? 0;
  const avgRating = Math.round((reviewRow?.avg ?? 0) * 10) / 10;
  const tier = tierFor(completedSales, avgRating);

  return { completedSales, avgRating, reviewCount, tier, feeBps: feeBpsForTier(tier) };
}
