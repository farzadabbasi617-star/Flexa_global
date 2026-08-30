/**
 * Admin control for storefront promotions.
 *
 * Approval is intentionally an admin action rather than an automatic
 * consequence of payment. When the paid flow is added, buying a slot will
 * create a `pending_review` request that still passes through here, so a
 * purchase can never buy its way onto the front page unreviewed.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeListings, users } from "@/db/schema";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { MAX_FEATURED_DAYS, resolveFeaturedUntil } from "@/lib/store-featured";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Two lists in one response:
 *
 *   promotions  listings that already have a promotion, for the review queue
 *   promotable  active, in-stock listings with no promotion yet
 *
 * The second exists because an admin has to be able to *start* a placement,
 * not only approve one someone else requested. Until the paid flow lands
 * nobody can request one, so without this the panel would always be empty.
 */
export async function GET(request: NextRequest) {
  const { user, error, status } = await requireAdminPermission(request, "store");
  if (!user) return NextResponse.json({ error }, { status });

  try {
    const rows = await db
      .select({
        id: storeListings.id,
        title: storeListings.title,
        source: storeListings.source,
        sellerName: users.displayName,
        status: storeListings.status,
        stock: storeListings.stock,
        priceRial: storeListings.priceRial,
        featuredStatus: storeListings.featuredStatus,
        featuredUntil: storeListings.featuredUntil,
        featuredRank: storeListings.featuredRank,
        featuredRequestedAt: storeListings.featuredRequestedAt,
        featuredRejectionReason: storeListings.featuredRejectionReason,
      })
      .from(storeListings)
      .leftJoin(users, eq(users.id, storeListings.sellerId))
      .where(ne(storeListings.featuredStatus, "none"))
      .orderBy(desc(storeListings.featuredRank), desc(storeListings.featuredRequestedAt))
      .limit(200);

    // Candidates an admin can promote right now. Same conditions the public
    // carousel enforces, so nothing offered here can be approved and then
    // silently filtered out of the storefront.
    const candidates = await db
      .select({
        id: storeListings.id,
        title: storeListings.title,
        source: storeListings.source,
        sellerName: users.displayName,
        status: storeListings.status,
        stock: storeListings.stock,
        priceRial: storeListings.priceRial,
        soldCount: storeListings.soldCount,
      })
      .from(storeListings)
      .leftJoin(users, eq(users.id, storeListings.sellerId))
      .where(
        and(
          eq(storeListings.featuredStatus, "none"),
          eq(storeListings.status, "active"),
          sql`${storeListings.stock} > 0`
        )
      )
      .orderBy(desc(storeListings.createdAt))
      .limit(100);

    const withToman = <T extends { priceRial: string }>(row: T) => ({
      ...row,
      priceToman: Number(BigInt(row.priceRial) / BigInt(10)),
    });

    return NextResponse.json({
      items: rows.map(withToman),
      promotable: candidates.map(withToman),
    });
  } catch (err) {
    logger.error({ error: err }, "Admin featured listing query failed");
    return NextResponse.json({ error: "خطا در دریافت محصولات ویژه" }, { status: 500 });
  }
}

/**
 * approve | reject | clear
 *
 * `clear` exists so a placement can be pulled immediately (a bad listing, a
 * refund) without waiting for it to expire.
 */
export async function PATCH(request: NextRequest) {
  const { user, error, status } = await requireAdminPermission(request, "store");
  if (!user) return NextResponse.json({ error }, { status });

  try {
    const body = await request.json().catch(() => ({}));
    const listingId = String(body?.listingId || "").trim();
    const action = String(body?.action || "").trim();

    if (!listingId) {
      return NextResponse.json({ error: "شناسه محصول الزامی است" }, { status: 400 });
    }
    if (!["approve", "reject", "clear"].includes(action)) {
      return NextResponse.json({ error: "عملیات نامعتبر است" }, { status: 400 });
    }

    const [listing] = await db
      .select({ id: storeListings.id, status: storeListings.status, title: storeListings.title })
      .from(storeListings)
      .where(eq(storeListings.id, listingId))
      .limit(1);

    if (!listing) {
      return NextResponse.json({ error: "محصول یافت نشد" }, { status: 404 });
    }

    const now = new Date();
    let clampedFrom: number | null = null;

    const patch: Record<string, unknown> = {
      featuredReviewedAt: now,
      featuredReviewedBy: user.id,
      updatedAt: now,
    };

    if (action === "approve") {
      // Promoting a listing that cannot be bought would burn the slot and
      // dead-end the buyer, so refuse rather than silently produce a
      // placement the public query will filter out anyway.
      if (listing.status !== "active") {
        return NextResponse.json(
          { error: "فقط محصول فعال قابل ویژه‌شدن است." },
          { status: 409 }
        );
      }

      const resolved = resolveFeaturedUntil(Number(body?.days ?? 7), now);
      clampedFrom = resolved.clampedFrom;

      const rank = Number(body?.rank ?? 0);
      patch.featuredStatus = "approved";
      patch.featuredUntil = resolved.until;
      patch.featuredRank = Number.isFinite(rank) ? Math.max(0, Math.floor(rank)) : 0;
      patch.featuredRejectionReason = null;
    } else if (action === "reject") {
      patch.featuredStatus = "rejected";
      patch.featuredUntil = null;
      patch.featuredRejectionReason = String(body?.reason || "").slice(0, 500) || null;
    } else {
      // clear: back to a non-promoted listing, history of the review kept.
      patch.featuredStatus = "none";
      patch.featuredUntil = null;
      patch.featuredRank = 0;
      patch.featuredRejectionReason = null;
    }

    await db.update(storeListings).set(patch).where(eq(storeListings.id, listingId));

    // Placements will be chargeable, so who changed what has to be answerable.
    await logAdminAction({
      adminId: user.id,
      action: `store_featured_${action}`,
      entityType: "store_listing",
      entityId: listingId,
      metadata: {
        title: listing.title,
        days: body?.days ?? null,
        rank: patch.featuredRank ?? null,
        clampedFrom,
      },
      ipAddress: getClientIp(request.headers),
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      featuredStatus: patch.featuredStatus,
      featuredUntil: patch.featuredUntil ?? null,
      // Surfaced so an admin who typed 3650 days learns it became the cap
      // instead of assuming it worked.
      warning: clampedFrom ? `مدت به حداکثر ${MAX_FEATURED_DAYS} روز محدود شد.` : undefined,
    });
  } catch (err) {
    logger.error({ error: err }, "Admin featured listing update failed");
    return NextResponse.json({ error: "بروزرسانی محصول ویژه انجام نشد" }, { status: 500 });
  }
}
