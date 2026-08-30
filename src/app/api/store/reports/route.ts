import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeReports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const REASONS = new Set(["fraud", "fake", "wrong_price", "inappropriate", "stolen_account", "other"]);

// POST: report a listing/seller/order. Body: { listingId?, sellerId?, orderId?, reason, details? }
export async function POST(request: NextRequest) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`store:report:${user.id}:${ip}`, 15, 60 * 60 * 1000);
    if (!limit.success) return NextResponse.json({ error: "تعداد گزارش‌ها زیاد است." }, { status: 429 });

    const body = await request.json().catch(() => ({}));
    const reason = String(body.reason || "");
    if (!REASONS.has(reason)) return NextResponse.json({ error: "دلیل گزارش نامعتبر است" }, { status: 400 });

    const listingId = body.listingId ? String(body.listingId) : null;
    const sellerId = body.sellerId ? String(body.sellerId) : null;
    const orderId = body.orderId ? String(body.orderId) : null;
    if (!listingId && !sellerId && !orderId) {
      return NextResponse.json({ error: "هدف گزارش مشخص نیست" }, { status: 400 });
    }

    const [created] = await db
      .insert(storeReports)
      .values({
        reporterId: user.id,
        listingId,
        sellerId,
        orderId,
        reason,
        details: body.details ? String(body.details).slice(0, 2000) : null,
        status: "open",
      })
      .returning({ id: storeReports.id });

    return NextResponse.json({ report: created }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Store report POST error");
    return NextResponse.json({ error: "خطا در ثبت گزارش" }, { status: 500 });
  }
}
