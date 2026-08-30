import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeListings, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { StoreListingCreateSchema, StoreListingReviewSchema } from "@/lib/validations";
import { parseTomanToRial } from "@/lib/money";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: all listings (any status), for moderation.
export async function GET(request: NextRequest) {
  const { user, error, status } = await requireAdminPermission(request, "store");
  if (!user) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("status");

  const conditions = [];
  if (filter) conditions.push(eq(storeListings.status, filter as never));

  const rows = await db
    .select({
      id: storeListings.id,
      source: storeListings.source,
      sellerId: storeListings.sellerId,
      sellerName: users.displayName,
      kind: storeListings.kind,
      game: storeListings.game,
      title: storeListings.title,
      description: storeListings.description,
      priceRial: storeListings.priceRial,
      stock: storeListings.stock,
      status: storeListings.status,
      images: storeListings.images,
      metadata: storeListings.metadata,
      deliveryNotes: storeListings.deliveryNotes,
      createdAt: storeListings.createdAt,
    })
    .from(storeListings)
    .leftJoin(users, eq(users.id, storeListings.sellerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(storeListings.createdAt))
    .limit(200);

  return NextResponse.json({
    items: rows.map((r) => ({ ...r, priceToman: Number(BigInt(r.priceRial) / BigInt(10)) })),
  });
}

// POST: admin creates an OFFICIAL platform listing (auto-active, no commission).
export async function POST(request: NextRequest) {
  try {
    const { user, error, status } = await requireAdminPermission(request, "store");
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json().catch(() => ({}));
    const parsed = StoreListingCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "اطلاعات نامعتبر" }, { status: 400 });
    }
    const d = parsed.data;
    const priceRial = parseTomanToRial(String(d.priceToman));

    const [created] = await db
      .insert(storeListings)
      .values({
        source: "official",
        sellerId: null,
        kind: d.kind,
        game: d.game ?? null,
        title: d.title,
        description: d.description ?? null,
        priceRial: priceRial.toString(),
        currencyKind: d.currencyKind ?? null,
        currencyAmount: d.currencyAmount ?? null,
        stock: d.stock,
        images: d.images,
        deliveryNotes: d.deliveryNotes ?? null,
        status: "active",
        reviewedBy: user.id,
      })
      .returning({ id: storeListings.id });

    await logAdminAction({
      adminId: user.id,
      action: "store_official_listing_create",
      entityType: "store_listing",
      entityId: created.id,
      metadata: { title: d.title, kind: d.kind },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ listing: created }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Admin official listing POST error");
    return NextResponse.json({ error: "خطا در ساخت محصول رسمی" }, { status: 500 });
  }
}

// PATCH: approve / reject a user listing. Body: { id, decision, rejectionReason? }
export async function PATCH(request: NextRequest) {
  try {
    const { user, error, status } = await requireAdminPermission(request, "store");
    if (!user) return NextResponse.json({ error }, { status });

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    const parsed = StoreListingReviewSchema.safeParse(body);
    if (!id || !parsed.success) {
      return NextResponse.json({ error: parsed.success ? "شناسه الزامی است" : parsed.error.issues[0]?.message }, { status: 400 });
    }
    const { decision, rejectionReason } = parsed.data;

    const [updated] = await db
      .update(storeListings)
      .set({
        status: decision === "approve" ? "active" : "rejected",
        rejectionReason: decision === "reject" ? rejectionReason ?? null : null,
        reviewedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(storeListings.id, id))
      .returning({ id: storeListings.id, status: storeListings.status });

    if (!updated) return NextResponse.json({ error: "آگهی یافت نشد" }, { status: 404 });

    await logAdminAction({
      adminId: user.id,
      action: `store_listing_${decision}`,
      entityType: "store_listing",
      entityId: id,
      metadata: { rejectionReason },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ listing: updated });
  } catch (err) {
    logger.error({ err }, "Admin listing review error");
    return NextResponse.json({ error: "خطا در بررسی آگهی" }, { status: 500 });
  }
}
