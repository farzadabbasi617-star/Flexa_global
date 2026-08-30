import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeOffers, storeListings, users } from "@/db/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { StoreOfferCreateSchema } from "@/lib/validations";
import { createOffer, StoreError } from "@/lib/store-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: offers where the user is buyer or seller (optionally filtered by role/listing).
export async function GET(request: NextRequest) {
  const { user, error, status } = await requireUser(request);
  if (!user) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role"); // buyer | seller
  const listingId = searchParams.get("listingId");

  const roleCond =
    role === "seller"
      ? eq(storeOffers.sellerId, user.id)
      : role === "buyer"
        ? eq(storeOffers.buyerId, user.id)
        : or(eq(storeOffers.buyerId, user.id), eq(storeOffers.sellerId, user.id));

  const where = listingId ? and(roleCond, eq(storeOffers.listingId, listingId)) : roleCond;

  const rows = await db
    .select({
      id: storeOffers.id,
      listingId: storeOffers.listingId,
      title: storeListings.title,
      buyerId: storeOffers.buyerId,
      sellerId: storeOffers.sellerId,
      buyerName: users.displayName,
      offerPriceRial: storeOffers.offerPriceRial,
      listingPriceRial: storeOffers.listingPriceRial,
      message: storeOffers.message,
      status: storeOffers.status,
      orderId: storeOffers.orderId,
      expiresAt: storeOffers.expiresAt,
      createdAt: storeOffers.createdAt,
    })
    .from(storeOffers)
    .leftJoin(storeListings, eq(storeListings.id, storeOffers.listingId))
    .leftJoin(users, eq(users.id, storeOffers.buyerId))
    .where(where)
    .orderBy(desc(storeOffers.createdAt))
    .limit(100);

  const items = rows.map((r) => ({
    id: r.id,
    listingId: r.listingId,
    title: r.title,
    buyerName: r.buyerName,
    offerToman: Number(BigInt(r.offerPriceRial) / BigInt(10)),
    listingToman: Number(BigInt(r.listingPriceRial) / BigInt(10)),
    message: r.message,
    status: r.status,
    orderId: r.orderId,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
    iAmBuyer: r.buyerId === user.id,
    iAmSeller: r.sellerId === user.id,
  }));

  return NextResponse.json({ items });
}

// POST: buyer makes a price offer on a user listing.
export async function POST(request: NextRequest) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`store:offer:create:${user.id}:${ip}`, 20, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = StoreOfferCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "اطلاعات نامعتبر" }, { status: 400 });
    }

    const offer = await createOffer({
      buyerId: user.id,
      listingId: parsed.data.listingId,
      offerToman: parsed.data.offerToman,
      message: parsed.data.message,
    });

    return NextResponse.json({ offer }, { status: 201 });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({ err }, "Store offer POST error");
    return NextResponse.json({ error: "خطا در ثبت پیشنهاد" }, { status: 500 });
  }
}
