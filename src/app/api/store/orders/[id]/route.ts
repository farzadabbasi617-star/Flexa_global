import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeOrders, storeListings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { StoreOrderActionSchema } from "@/lib/validations";
import {
  markDelivered,
  confirmAndRelease,
  openDispute,
  refundOrder,
  ensureStoreOrderLifecycleSchema,
  StoreError,
} from "@/lib/store-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["admin", "super_admin", "moderator"];

// GET: full order detail. Protected delivery notes only revealed to the buyer
// once the order is delivered/completed.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error, status } = await requireUser(request);
  if (!user) return NextResponse.json({ error }, { status });
  await ensureStoreOrderLifecycleSchema();
  const { id } = await params;

  const [order] = await db
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.id, id))
    .limit(1);
  if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

  const isParty = order.buyerId === user.id || order.sellerId === user.id;
  const isAdmin = ADMIN_ROLES.includes(user.role);
  if (!isParty && !isAdmin) {
    return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 403 });
  }

  const [listing] = await db
    .select({
      title: storeListings.title,
      kind: storeListings.kind,
      deliveryNotes: storeListings.deliveryNotes,
    })
    .from(storeListings)
    .where(eq(storeListings.id, order.listingId))
    .limit(1);

  // Reveal protected delivery details to the buyer only after delivery/completion.
  const revealDelivery =
    order.buyerId === user.id && ["delivered", "completed"].includes(order.status);

  return NextResponse.json({
    order: {
      ...order,
      totalPriceToman: Number(BigInt(order.totalPriceRial) / BigInt(10)),
      listingTitle: listing?.title,
      listingKind: listing?.kind,
      deliveryNotes: revealDelivery ? listing?.deliveryNotes ?? null : null,
    },
  });
}

// PATCH: lifecycle actions (deliver / confirm / dispute / cancel).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = StoreOrderActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "عملیات نامعتبر" }, { status: 400 });
    }

    const isAdmin = ADMIN_ROLES.includes(user.role);
    const { action, reason } = parsed.data;

    let result;
    switch (action) {
      case "deliver":
        result = await markDelivered(id, user.id, isAdmin);
        break;
      case "confirm":
        result = await confirmAndRelease(id, user.id, isAdmin);
        break;
      case "dispute":
        if (!reason) return NextResponse.json({ error: "دلیل اعتراض الزامی است" }, { status: 400 });
        result = await openDispute(id, user.id, reason);
        break;
      case "cancel":
        // A buyer cancel before delivery is treated as a refund; admins can always refund.
        result = await refundOrder(id, user.id, reason, isAdmin);
        break;
      default:
        return NextResponse.json({ error: "عملیات ناشناخته" }, { status: 400 });
    }

    return NextResponse.json({ order: result });
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({ err }, "Store order PATCH error");
    return NextResponse.json({ error: "خطا در پردازش سفارش" }, { status: 500 });
  }
}
