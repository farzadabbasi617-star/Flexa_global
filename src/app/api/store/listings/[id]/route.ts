import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { storeListings, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { parseTomanToRial } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import {
  canSellerActOnListing,
  isMaterialListingChange,
  statusAfterSellerEdit,
} from "@/lib/store-seller-listing";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET: public detail of a single listing. Protected delivery notes are never
// included here — they are only revealed through the order endpoint post-purchase.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [row] = await db
      .select({
        id: storeListings.id,
        source: storeListings.source,
        kind: storeListings.kind,
        game: storeListings.game,
        title: storeListings.title,
        description: storeListings.description,
        priceRial: storeListings.priceRial,
        currencyKind: storeListings.currencyKind,
        currencyAmount: storeListings.currencyAmount,
        stock: storeListings.stock,
        soldCount: storeListings.soldCount,
        warrantyDays: storeListings.warrantyDays,
        images: storeListings.images,
        metadata: storeListings.metadata,
        status: storeListings.status,
        createdAt: storeListings.createdAt,
        sellerId: storeListings.sellerId,
        sellerName: users.displayName,
        sellerVerified: users.isVerified,
      })
      .from(storeListings)
      .leftJoin(users, eq(users.id, storeListings.sellerId))
      .where(eq(storeListings.id, id))
      .limit(1);

    if (!row || row.status !== "active") {
      return NextResponse.json({ error: "آگهی یافت نشد یا غیرفعال است" }, { status: 404 });
    }

    return NextResponse.json({
      listing: { ...row, priceToman: Number(BigInt(row.priceRial) / BigInt(10)) },
    });
  } catch (err) {
    logger.error({ err }, "Store listing detail error");
    return NextResponse.json({ error: "خطا در دریافت محصول" }, { status: 500 });
  }
}


/**
 * Seller self-service on their own listing.
 *
 * Body: { action: "update" | "pause" | "resume" | "archive", ...fields }
 *
 * Only the owning seller of a `source: "user"` listing can do anything here;
 * official Flexa stock stays under the admin panel. A material edit to an
 * already-approved listing drops it back to pending_review so approval cannot
 * be used as a bait-and-switch.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`store:listing:update:${user.id}:${ip}`, 60, 60 * 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد ویرایش‌ها زیاد است. بعداً تلاش کنید." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "update");
    if (!["update", "pause", "resume", "archive"].includes(action)) {
      return NextResponse.json({ error: "عملیات نامعتبر است." }, { status: 400 });
    }

    const [listing] = await db.select().from(storeListings).where(eq(storeListings.id, id)).limit(1);
    if (!listing) return NextResponse.json({ error: "آگهی یافت نشد." }, { status: 404 });

    const verdict = canSellerActOnListing(
      { sellerId: listing.sellerId, source: listing.source, status: listing.status },
      user.id,
      action as "update" | "pause" | "resume" | "archive"
    );
    if (!verdict.allowed) {
      return NextResponse.json({ error: verdict.error }, { status: verdict.status || 403 });
    }

    if (action === "pause" || action === "resume" || action === "archive") {
      const nextStatus = action === "pause" ? "paused" : action === "resume" ? "active" : "archived";
      const [updated] = await db
        .update(storeListings)
        // Re-assert the status we validated against: if a purchase or an admin
        // changed it in between, this update matches nothing rather than
        // stomping the newer state.
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(and(eq(storeListings.id, id), eq(storeListings.status, listing.status)))
        .returning({ id: storeListings.id, status: storeListings.status });

      if (!updated) {
        return NextResponse.json({ error: "وضعیت آگهی تغییر کرده است. صفحه را تازه کنید." }, { status: 409 });
      }
      return NextResponse.json({ listing: updated });
    }

    // --- update ---
    const patch: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (title.length < 3 || title.length > 200) {
        return NextResponse.json({ error: "عنوان باید بین ۳ تا ۲۰۰ کاراکتر باشد." }, { status: 400 });
      }
      patch.title = title;
    }

    if (body.description !== undefined) {
      const description = String(body.description || "").trim();
      if (description.length > 5000) {
        return NextResponse.json({ error: "توضیحات بیش از حد طولانی است." }, { status: 400 });
      }
      patch.description = description || null;
    }

    if (body.deliveryNotes !== undefined) {
      const notes = String(body.deliveryNotes || "").trim();
      if (notes.length > 5000) {
        return NextResponse.json({ error: "اطلاعات تحویل بیش از حد طولانی است." }, { status: 400 });
      }
      patch.deliveryNotes = notes || null;
    }

    if (body.priceToman !== undefined) {
      const priceRial = parseTomanToRial(String(body.priceToman));
      if (priceRial <= BigInt(0)) {
        return NextResponse.json({ error: "قیمت نامعتبر است." }, { status: 400 });
      }
      patch.priceRial = priceRial.toString();
    }

    if (body.stock !== undefined) {
      const stock = Number(body.stock);
      if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
        return NextResponse.json({ error: "موجودی نامعتبر است." }, { status: 400 });
      }
      // An account is a single unique item; the create path enforces the same.
      if (listing.kind === "account" && stock > 1) {
        return NextResponse.json({ error: "برای فروش اکانت، موجودی باید حداکثر ۱ باشد." }, { status: 400 });
      }
      patch.stock = stock;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "چیزی برای تغییر ارسال نشده است." }, { status: 400 });
    }

    const material = isMaterialListingChange(
      {
        title: listing.title,
        description: listing.description,
        priceRial: listing.priceRial,
        deliveryNotes: listing.deliveryNotes,
      },
      patch as { title?: string; description?: string | null; priceRial?: string; deliveryNotes?: string | null }
    );

    patch.status = statusAfterSellerEdit(listing.status, material);
    patch.updatedAt = new Date();

    const [updated] = await db
      .update(storeListings)
      .set(patch)
      .where(and(eq(storeListings.id, id), eq(storeListings.status, listing.status)))
      .returning({ id: storeListings.id, status: storeListings.status });

    if (!updated) {
      return NextResponse.json({ error: "وضعیت آگهی تغییر کرده است. صفحه را تازه کنید." }, { status: 409 });
    }

    return NextResponse.json({
      listing: updated,
      // The UI needs to explain why an approved ad just disappeared from the store.
      requiresReview: material && updated.status === "pending_review",
    });
  } catch (err) {
    logger.error({ err }, "Store listing PATCH error");
    return NextResponse.json({ error: "خطا در ویرایش آگهی" }, { status: 500 });
  }
}
