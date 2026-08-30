/**
 * A seller's own listings, in every status.
 *
 * The public list only returns `active` rows, so a seller had no way to see an
 * ad that was awaiting review, rejected, paused or sold out -- which in
 * practice meant no way to see their own inventory at all. This is deliberately
 * separate from the public endpoint rather than a `?mine=1` flag on it: that
 * endpoint's whole contract is "safe for anonymous callers", and adding an
 * auth-dependent branch to it is how a private field eventually leaks.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeListings } from "@/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const rows = await db
      .select({
        id: storeListings.id,
        kind: storeListings.kind,
        game: storeListings.game,
        title: storeListings.title,
        description: storeListings.description,
        priceRial: storeListings.priceRial,
        stock: storeListings.stock,
        soldCount: storeListings.soldCount,
        images: storeListings.images,
        status: storeListings.status,
        rejectionReason: storeListings.rejectionReason,
        featuredStatus: storeListings.featuredStatus,
        featuredUntil: storeListings.featuredUntil,
        deliveryNotes: storeListings.deliveryNotes,
        createdAt: storeListings.createdAt,
        updatedAt: storeListings.updatedAt,
      })
      .from(storeListings)
      .where(
        and(
          eq(storeListings.sellerId, user.id),
          // Archived is the seller's own delete; keep it out of their list.
          ne(storeListings.status, "archived")
        )
      )
      .orderBy(desc(storeListings.createdAt))
      .limit(200);

    // deliveryNotes is the seller's own text, so it is safe here -- this is the
    // one context where returning it is correct, since they need to edit it.
    const items = rows.map((row) => ({
      ...row,
      priceToman: Number(BigInt(row.priceRial) / BigInt(10)),
    }));

    return NextResponse.json({ items });
  } catch (err) {
    logger.error({ err }, "Seller listings GET error");
    return NextResponse.json({ error: "خطا در دریافت آگهی‌های شما" }, { status: 500 });
  }
}
