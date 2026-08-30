import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeOrders, storeListings } from "@/db/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { StoreOrderCreateSchema } from "@/lib/validations";
import { createEscrowOrder, ensureStoreOrderLifecycleSchema, StoreError } from "@/lib/store-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: orders where the user is buyer or seller.
export async function GET(request: NextRequest) {
  const { user, error, status } = await requireUser(request);
  if (!user) return NextResponse.json({ error }, { status });
  await ensureStoreOrderLifecycleSchema();

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role"); // buyer | seller

  const condition =
    role === "seller"
      ? eq(storeOrders.sellerId, user.id)
      : role === "buyer"
        ? eq(storeOrders.buyerId, user.id)
        : or(eq(storeOrders.buyerId, user.id), eq(storeOrders.sellerId, user.id));

  const rows = await db
    .select({
      id: storeOrders.id,
      listingId: storeOrders.listingId,
      title: storeListings.title,
      kind: storeListings.kind,
      buyerId: storeOrders.buyerId,
      sellerId: storeOrders.sellerId,
      source: storeOrders.source,
      quantity: storeOrders.quantity,
      totalPriceRial: storeOrders.totalPriceRial,
      sellerPayoutRial: storeOrders.sellerPayoutRial,
      status: storeOrders.status,
      deliveredAt: storeOrders.deliveredAt,
      deliveryDeadlineAt: storeOrders.deliveryDeadlineAt,
      autoReleaseAt: storeOrders.autoReleaseAt,
      completedAt: storeOrders.completedAt,
      createdAt: storeOrders.createdAt,
    })
    .from(storeOrders)
    .leftJoin(storeListings, eq(storeListings.id, storeOrders.listingId))
    .where(condition)
    .orderBy(desc(storeOrders.createdAt))
    .limit(100);

  const items = rows.map((r) => ({
    ...r,
    totalPriceToman: Number(BigInt(r.totalPriceRial) / BigInt(10)),
    iAmBuyer: r.buyerId === user.id,
    iAmSeller: r.sellerId === user.id,
  }));

  return NextResponse.json({ items });
}

// POST: buy a listing (creates escrow order, debits buyer wallet).
export async function POST(request: NextRequest) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`store:order:create:${user.id}:${ip}`, 30, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = StoreOrderCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "اطلاعات نامعتبر" }, { status: 400 });
    }

    const order = await createEscrowOrder({
      buyerId: user.id,
      listingId: parsed.data.listingId,
      quantity: parsed.data.quantity,
      buyerNote: parsed.data.buyerNote,
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({ err }, "Store order POST error");
    return NextResponse.json({ error: "خطا در ثبت سفارش" }, { status: 500 });
  }
}
