import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSellerStats, TIER_LABELS } from "@/lib/seller-reputation";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: public reputation summary for a seller.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [seller] = await db
      .select({ id: users.id, displayName: users.displayName, isVerified: users.isVerified, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!seller) return NextResponse.json({ error: "فروشنده یافت نشد" }, { status: 404 });

    const stats = await getSellerStats(id);
    return NextResponse.json({
      seller: {
        id: seller.id,
        displayName: seller.displayName,
        isVerified: seller.isVerified,
        memberSince: seller.createdAt,
      },
      stats: { ...stats, tierLabel: TIER_LABELS[stats.tier] },
    });
  } catch (err) {
    logger.error({ err }, "Seller stats error");
    return NextResponse.json({ error: "خطا در دریافت اطلاعات فروشنده" }, { status: 500 });
  }
}
