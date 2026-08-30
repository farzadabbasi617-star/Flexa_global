import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sellerReviews, storeOrders, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET ?sellerId=... : public list of a seller's reviews.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sellerId = searchParams.get("sellerId");
  if (!sellerId) return NextResponse.json({ error: "sellerId الزامی است" }, { status: 400 });

  const rows = await db
    .select({
      id: sellerReviews.id,
      rating: sellerReviews.rating,
      comment: sellerReviews.comment,
      createdAt: sellerReviews.createdAt,
      buyerName: users.displayName,
    })
    .from(sellerReviews)
    .leftJoin(users, eq(users.id, sellerReviews.buyerId))
    .where(eq(sellerReviews.sellerId, sellerId))
    .orderBy(desc(sellerReviews.createdAt))
    .limit(50);

  return NextResponse.json({ items: rows });
}

// POST: buyer leaves a review for a completed order. Body: { orderId, rating, comment }
export async function POST(request: NextRequest) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`store:review:${user.id}:${ip}`, 30, 60 * 60 * 1000);
    if (!limit.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است." }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId || "");
    const rating = Math.round(Number(body.rating));
    const comment = body.comment ? String(body.comment).slice(0, 1000) : null;

    if (!orderId || !Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "امتیاز باید بین ۱ تا ۵ باشد" }, { status: 400 });
    }

    const [order] = await db.select().from(storeOrders).where(eq(storeOrders.id, orderId)).limit(1);
    if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
    if (order.buyerId !== user.id) return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
    if (order.status !== "completed") {
      return NextResponse.json({ error: "فقط برای سفارش‌های تکمیل‌شده می‌توان نظر ثبت کرد" }, { status: 409 });
    }
    if (!order.sellerId) {
      return NextResponse.json({ error: "این سفارش فروشنده‌ی کاربری ندارد" }, { status: 409 });
    }

    const [existing] = await db
      .select({ id: sellerReviews.id })
      .from(sellerReviews)
      .where(eq(sellerReviews.orderId, orderId))
      .limit(1);
    if (existing) return NextResponse.json({ error: "قبلاً برای این سفارش نظر ثبت کرده‌اید" }, { status: 409 });

    const [created] = await db
      .insert(sellerReviews)
      .values({ orderId, sellerId: order.sellerId, buyerId: user.id, rating, comment })
      .returning({ id: sellerReviews.id });

    return NextResponse.json({ review: created }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Seller review POST error");
    return NextResponse.json({ error: "خطا در ثبت نظر" }, { status: 500 });
  }
}
