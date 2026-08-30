/**
 * Listings promoted into the storefront hero carousel.
 *
 * Separate from /api/store/listings because the two answer different
 * questions: that one is a filtered, paginated catalogue, this one is a short
 * ordered shop window. Folding it in would mean every catalogue request
 * carried carousel-only sorting it does not use.
 */
import { NextResponse } from "next/server";
import { db } from "@/db";
import { storeListings, users } from "@/db/schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { FEATURED_LIMIT } from "@/lib/store-featured";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select({
        id: storeListings.id,
        source: storeListings.source,
        kind: storeListings.kind,
        game: storeListings.game,
        title: storeListings.title,
        description: storeListings.description,
        priceRial: storeListings.priceRial,
        currencyKind: storeListings.currencyKind,
        currencyAmount: storeListings.currencyAmount,
        stock: storeListings.stock,
        soldCount: storeListings.soldCount,
        warrantyDays: storeListings.warrantyDays,
        images: storeListings.images,
        createdAt: storeListings.createdAt,
        featuredUntil: storeListings.featuredUntil,
        featuredRank: storeListings.featuredRank,
        sellerName: users.displayName,
      })
      .from(storeListings)
      .leftJoin(users, eq(users.id, storeListings.sellerId))
      .where(
        and(
          // Approved AND unexpired: expiry is enforced in the query so a
          // lapsed placement disappears on its own, with no cleanup job to
          // forget to run.
          eq(storeListings.featuredStatus, "approved"),
          gt(storeListings.featuredUntil, new Date()),
          // Only show what can actually be bought. A promoted sold-out item
          // wastes the slot and dead-ends the buyer who clicks it.
          eq(storeListings.status, "active"),
          sql`${storeListings.stock} > 0`
        )
      )
      // Highest rank first, then soonest to expire so a lapsing slot still
      // gets its remaining exposure.
      .orderBy(desc(storeListings.featuredRank), storeListings.featuredUntil)
      .limit(FEATURED_LIMIT);

    // deliveryNotes and sellerId are deliberately not selected: this is a
    // public endpoint and neither belongs in a shop window.
    const items = rows.map((row) => ({
      ...row,
      priceToman: Number(BigInt(row.priceRial) / BigInt(10)),
    }));

    return NextResponse.json(
      { items },
      // Short shared cache: the carousel changes rarely but sits on the busiest
      // page, so this absorbs repeat traffic without making a new placement
      // wait minutes to appear.
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } }
    );
  } catch (error) {
    logger.error({ error }, "Featured store listings query failed");
    // The carousel is decoration, not function: an empty list degrades the
    // page gracefully instead of failing the whole storefront.
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
