import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeOrders, storeListings, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { refundOrder, confirmAndRelease, StoreError } from "@/lib/store-service";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: orders for admin oversight (default: disputed).
export async function GET(request: NextRequest) {
  const { user, error, status } = await requireAdminPermission(request, "store");
  if (!user) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("status") || "disputed";

  const conditions = [];
  if (filter !== "all") conditions.push(eq(storeOrders.status, filter as never));

  const rows = await db
    .select({
      id: storeOrders.id,
      title: storeListings.title,
      buyerName: users.displayName,
      buyerId: storeOrders.buyerId,
      sellerId: storeOrders.sellerId,
      source: storeOrders.source,
      totalPriceRial: storeOrders.totalPriceRial,
      status: storeOrders.status,
      disputeReason: storeOrders.disputeReason,
      createdAt: storeOrders.createdAt,
    })
    .from(storeOrders)
    .leftJoin(storeListings, eq(storeListings.id, storeOrders.listingId))
    .leftJoin(users, eq(users.id, storeOrders.buyerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(storeOrders.createdAt))
    .limit(200);

  return NextResponse.json({
    items: rows.map((r) => ({ ...r, totalPriceToman: Number(BigInt(r.totalPriceRial) / BigInt(10)) })),
  });
}

// PATCH: admin resolves a dispute. Body: { id, resolution: 'refund_buyer' | 'release_seller', reason? }
export async function PATCH(request: NextRequest) {
  try {
    const { user, error, status } = await requireAdminPermission(request, "store");
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const resolution = String(body.resolution || "");
    const reason = body.reason ? String(body.reason).slice(0, 1000) : undefined;
    if (!id || !["refund_buyer", "release_seller"].includes(resolution)) {
      return NextResponse.json({ error: "اطلاعات نامعتبر" }, { status: 400 });
    }

    const [order] = await db.select().from(storeOrders).where(eq(storeOrders.id, id)).limit(1);
    if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

    let result;
    if (resolution === "refund_buyer") {
      result = await refundOrder(id, user.id, reason, true);
    } else {
      // Release escrow to the seller on behalf of the buyer (admin override).
      result = await confirmAndRelease(id, user.id, true);
    }

    await logAdminAction({
      adminId: user.id,
      action: `store_dispute_${resolution}`,
      entityType: "store_order",
      entityId: id,
      metadata: { reason },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ order: result });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({ err }, "Admin order resolve error");
    return NextResponse.json({ error: "خطا در حل اختلاف" }, { status: 500 });
  }
}
