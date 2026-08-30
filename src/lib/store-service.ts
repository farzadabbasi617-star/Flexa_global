import crypto from "crypto";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  storeListings,
  storeOrders,
  storeOffers,
  wallets,
  transactions,
  kycProfiles,
  notifications,
} from "@/db/schema";
import { bigIntFromText } from "@/lib/money";
import { getSellerStats } from "@/lib/seller-reputation";
import logger from "@/lib/logger";
import {
  autoReleaseDeadline,
  canConfirmStoreOrder,
  canRefundStoreOrder,
  deliveryDeadline,
} from "@/lib/store-order-policy";

/**
 * Platform commission taken from user (P2P) sales, in basis points.
 * 500 = 5%. Official listings have no commission (platform is the seller).
 */
export const PLATFORM_FEE_BPS = Number(process.env.STORE_FEE_BPS || "0");

let storeSchemaPromise: Promise<void> | null = null;
export function ensureStoreOrderLifecycleSchema(client: any = db) {
  if (client !== db) {
    return Promise.all([
      client.execute(sql.raw(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delivery_deadline_at timestamp`)),
      client.execute(sql.raw(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS auto_release_at timestamp`)),
    ]).then(() => undefined);
  }
  if (!storeSchemaPromise) {
    storeSchemaPromise = (async () => {
      await client.execute(sql.raw(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delivery_deadline_at timestamp`));
      await client.execute(sql.raw(`ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS auto_release_at timestamp`));
      await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS store_orders_delivery_deadline_idx ON store_orders(status, delivery_deadline_at)`));
      await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS store_orders_auto_release_idx ON store_orders(status, auto_release_at)`));
    })().catch((error) => {
      storeSchemaPromise = null;
      throw error;
    });
  }
  return storeSchemaPromise;
}

export class StoreError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function computeFee(totalRial: bigint, source: "official" | "user", feeBps: number = PLATFORM_FEE_BPS) {
  if (source === "official") {
    return { platformFeeRial: BigInt(0), sellerPayoutRial: BigInt(0) };
  }
  const bps = Number.isFinite(feeBps) && feeBps >= 0 ? Math.floor(feeBps) : PLATFORM_FEE_BPS;
  const platformFeeRial = (totalRial * BigInt(bps)) / BigInt(10000);
  const sellerPayoutRial = totalRial - platformFeeRial;
  return { platformFeeRial, sellerPayoutRial };
}

/** Fire-and-forget order notification (never blocks the financial flow). */
async function notify(userId: string | null | undefined, title: string, message: string, orderId: string) {
  if (!userId) return;
  try {
    await db.insert(notifications).values({
      userId,
      type: "store_order",
      title,
      message,
      link: `/store/orders`,
    });
  } catch (err) {
    logger.warn({ err, userId, orderId }, "Failed to create store notification");
  }
}

/** Whether a user is allowed to create marketplace listings (KYC verified). */
export async function canUserSell(userId: string): Promise<boolean> {
  const [kyc] = await db
    .select({ status: kycProfiles.status })
    .from(kycProfiles)
    .where(eq(kycProfiles.userId, userId))
    .limit(1);
  return kyc?.status === "verified";
}

// The drizzle transaction handle has the same query API as `db` for our needs.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getOrCreateWalletTx(tx: Tx, userId: string) {
  const [existing] = await tx
    .select()
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await tx
    .insert(wallets)
    .values({ userId, balance: "0", currency: "RIAL" })
    .returning();
  return created;
}

/**
 * Create an order and atomically move the buyer's funds into escrow.
 *
 * Flow:
 *  1. Lock the listing row, validate availability and stock.
 *  2. Lock the buyer's wallet, ensure sufficient balance.
 *  3. Debit buyer wallet, record a `store_escrow_hold` transaction (held by platform).
 *  4. Decrement stock and create the order in `paid_escrow` state.
 *
 * Funds are NOT credited to the seller here — that happens on confirmation.
 */
export async function createEscrowOrder(params: {
  buyerId: string;
  listingId: string;
  quantity: number;
  buyerNote?: string;
  /** Optional agreed unit price (RIAL), e.g. from an accepted offer. */
  overrideUnitPriceRial?: bigint;
  /** Optional existing transaction handle (used when accepting an offer). */
  tx?: Tx;
}) {
  const { buyerId, listingId, quantity, buyerNote, overrideUnitPriceRial, tx: outerTx } = params;
  await ensureStoreOrderLifecycleSchema(outerTx || db);

  const run = async (tx: Tx) => {
    // Lock listing to prevent overselling under concurrency.
    const [listing] = await tx
      .select()
      .from(storeListings)
      .where(eq(storeListings.id, listingId))
      .for("update")
      .limit(1);

    if (!listing) throw new StoreError("آگهی یافت نشد", 404);
    if (listing.status !== "active") throw new StoreError("این آگهی در حال حاضر فعال نیست", 409);
    if (listing.sellerId && listing.sellerId === buyerId) {
      throw new StoreError("نمی‌توانید کالای خودتان را بخرید", 409);
    }
    if (listing.stock < quantity) throw new StoreError("موجودی کافی نیست", 409);

    const unitPriceRial =
      overrideUnitPriceRial && overrideUnitPriceRial > BigInt(0)
        ? overrideUnitPriceRial
        : bigIntFromText(listing.priceRial);
    const totalPriceRial = unitPriceRial * BigInt(quantity);
    if (totalPriceRial <= BigInt(0)) throw new StoreError("قیمت نامعتبر است", 400);

    const source = listing.source as "official" | "user";
    const orderId = crypto.randomUUID();
    // Tiered commission: a higher-reputation seller pays a lower platform fee.
    let feeBps = PLATFORM_FEE_BPS;
    if (source === "user" && listing.sellerId) {
      try {
        const stats = await getSellerStats(listing.sellerId);
        feeBps = stats.feeBps;
      } catch {
        // keep default fee on any failure
      }
    }
    const { platformFeeRial, sellerPayoutRial } = computeFee(totalPriceRial, source, feeBps);

    // Lock & debit buyer wallet.
    const buyerWallet = await getOrCreateWalletTx(tx, buyerId);
    const [lockedWallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.id, buyerWallet.id))
      .for("update")
      .limit(1);

    const balance = bigIntFromText(lockedWallet.balance);
    if (balance < totalPriceRial) {
      throw new StoreError("موجودی کیف پول کافی نیست. لطفاً ابتدا شارژ کنید.", 402);
    }

    await tx
      .update(wallets)
      .set({ balance: (balance - totalPriceRial).toString(), updatedAt: new Date() })
      .where(eq(wallets.id, buyerWallet.id));

    // Record the escrow hold (debit) on the buyer's ledger.
    const [holdTx] = await tx
      .insert(transactions)
      .values({
        walletId: buyerWallet.id,
        amount: totalPriceRial.toString(),
        type: "store_escrow_hold",
        status: "completed",
        referenceId: `store-hold-${orderId}`,
        metadata: { orderId, listingId, quantity, source, role: "buyer", withdrawable: false },
      })
      .returning();

    // Decrement stock; mark sold_out if depleted.
    const newStock = listing.stock - quantity;
    await tx
      .update(storeListings)
      .set({
        stock: newStock,
        soldCount: listing.soldCount + quantity,
        status: newStock <= 0 ? "sold_out" : listing.status,
        updatedAt: new Date(),
      })
      .where(eq(storeListings.id, listingId));

    const [order] = await tx
      .insert(storeOrders)
      .values({
        id: orderId,
        listingId,
        buyerId,
        sellerId: listing.sellerId ?? null,
        source,
        quantity,
        unitPriceRial: unitPriceRial.toString(),
        totalPriceRial: totalPriceRial.toString(),
        platformFeeRial: platformFeeRial.toString(),
        sellerPayoutRial: sellerPayoutRial.toString(),
        status: "paid_escrow",
        holdTxId: holdTx.id,
        deliveryDeadlineAt: deliveryDeadline(),
        buyerNote: buyerNote ?? null,
      })
      .returning();

    logger.info({ orderId: order.id, buyerId, listingId, totalPriceRial: totalPriceRial.toString() }, "Store escrow order created");

    // Notify outside the financial mutations but still within tx scope is fine
    // here because notifications are best-effort and wrapped in try/catch.
    await notify(buyerId, "سفارش ثبت شد", `سفارش «${listing.title}» ثبت و مبلغ به‌صورت امانی نگه داشته شد.`, order.id);
    if (listing.sellerId) {
      await notify(listing.sellerId, "سفارش جدید", `کالای «${listing.title}» شما خریداری شد. لطفاً تحویل دهید.`, order.id);
    }
    return order;
  };

  // Reuse an existing transaction (offer-accept) or open a fresh one.
  return outerTx ? run(outerTx) : db.transaction(run);
}

/** Seller (or platform) marks the order as delivered. */
export async function markDelivered(orderId: string, actorId: string, isAdmin = false) {
  await ensureStoreOrderLifecycleSchema();
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(storeOrders)
      .where(eq(storeOrders.id, orderId))
      .for("update")
      .limit(1);
    if (!order) throw new StoreError("سفارش یافت نشد", 404);

    const isSeller = order.sellerId && order.sellerId === actorId;
    const isOfficial = order.source === "official";
    if (!isAdmin && !isSeller && !(isOfficial && isAdmin)) {
      throw new StoreError("شما اجازه این عمل را ندارید", 403);
    }
    if (order.status !== "paid_escrow") {
      throw new StoreError("این سفارش در وضعیت قابل تحویل نیست", 409);
    }

    const [updated] = await tx
      .update(storeOrders)
      .set({ status: "delivered", deliveredAt: new Date(), autoReleaseAt: autoReleaseDeadline(), updatedAt: new Date() })
      .where(eq(storeOrders.id, orderId))
      .returning();

    await notify(order.buyerId, "کالا تحویل داده شد", "فروشنده کالا را تحویل داد. لطفاً پس از بررسی، دریافت را تأیید کنید.", orderId);
    return updated;
  });
}

/**
 * Buyer confirms receipt. Releases escrow:
 *  - user (P2P): credit seller payout (minus platform fee).
 *  - official: funds simply settle to the platform (no seller credit).
 */
export async function confirmAndRelease(orderId: string, buyerId: string, isAdmin = false) {
  await ensureStoreOrderLifecycleSchema();
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(storeOrders)
      .where(eq(storeOrders.id, orderId))
      .for("update")
      .limit(1);
    if (!order) throw new StoreError("سفارش یافت نشد", 404);
    if (!isAdmin && order.buyerId !== buyerId) throw new StoreError("شما اجازه این عمل را ندارید", 403);
    if (!canConfirmStoreOrder(order.status, isAdmin)) {
      throw new StoreError("تأیید دریافت فقط پس از اعلام تحویل فروشنده ممکن است", 409);
    }

    let releaseTxId: string | null = null;

    if (order.source === "user" && order.sellerId) {
      const payout = bigIntFromText(order.sellerPayoutRial);
      const sellerWallet = await getOrCreateWalletTx(tx, order.sellerId);
      const [lockedSeller] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.id, sellerWallet.id))
        .for("update")
        .limit(1);

      await tx
        .update(wallets)
        .set({
          balance: (bigIntFromText(lockedSeller.balance) + payout).toString(),
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, sellerWallet.id));

      const [releaseTx] = await tx
        .insert(transactions)
        .values({
          walletId: sellerWallet.id,
          amount: payout.toString(),
          type: "store_payout",
          status: "completed",
          referenceId: `store-release-${order.id}`,
          metadata: {
            orderId: order.id,
            role: "seller",
            platformFeeRial: order.platformFeeRial,
            withdrawable: true,
          },
        })
        .returning();
      releaseTxId = releaseTx.id;
    }

    const [updated] = await tx
      .update(storeOrders)
      .set({
        status: "completed",
        completedAt: new Date(),
        releaseTxId,
        autoReleaseAt: null,
        updatedAt: new Date(),
      })
      .where(eq(storeOrders.id, orderId))
      .returning();

    logger.info({ orderId, releaseTxId }, "Store order completed & escrow released");

    await notify(order.buyerId, "سفارش تکمیل شد", "خرید شما با موفقیت تکمیل شد. از خرید شما متشکریم!", orderId);
    if (order.source === "user" && order.sellerId) {
      await notify(order.sellerId, "پرداخت آزاد شد", "خریدار دریافت را تأیید کرد و مبلغ به کیف پول شما واریز شد.", orderId);
    }
    return updated;
  });
}

/**
 * Refund the buyer (admin resolution of a dispute, or cancel).
 * Returns held funds to the buyer wallet and restocks the listing.
 */
export async function refundOrder(orderId: string, actorId: string, reason?: string, isAdmin = false) {
  await ensureStoreOrderLifecycleSchema();
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(storeOrders)
      .where(eq(storeOrders.id, orderId))
      .for("update")
      .limit(1);
    if (!order) throw new StoreError("سفارش یافت نشد", 404);
    if (!canRefundStoreOrder({ status: order.status, actorId, buyerId: order.buyerId, isAdmin })) {
      throw new StoreError("فقط خریدار پیش از تحویل یا ادمین می‌تواند سفارش را بازپرداخت کند", 403);
    }

    const total = bigIntFromText(order.totalPriceRial);
    const buyerWallet = await getOrCreateWalletTx(tx, order.buyerId);
    const [lockedBuyer] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.id, buyerWallet.id))
      .for("update")
      .limit(1);

    await tx
      .update(wallets)
      .set({
        balance: (bigIntFromText(lockedBuyer.balance) + total).toString(),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, buyerWallet.id));

    const [refundTx] = await tx
      .insert(transactions)
      .values({
        walletId: buyerWallet.id,
        amount: total.toString(),
        type: "refund",
        status: "completed",
        referenceId: `store-refund-${order.id}`,
        metadata: { orderId: order.id, role: "buyer", reason: reason ?? null, withdrawable: false },
      })
      .returning();

    // Restock the listing.
    await tx
      .update(storeListings)
      .set({
        stock: sql`${storeListings.stock} + ${order.quantity}`,
        soldCount: sql`GREATEST(${storeListings.soldCount} - ${order.quantity}, 0)`,
        status: sql`CASE WHEN ${storeListings.status} = 'sold_out' THEN 'active'::store_listing_status ELSE ${storeListings.status} END`,
        updatedAt: new Date(),
      })
      .where(eq(storeListings.id, order.listingId));

    const [updated] = await tx
      .update(storeOrders)
      .set({
        status: "refunded",
        refundTxId: refundTx.id,
        disputeReason: reason ?? order.disputeReason,
        deliveryDeadlineAt: null,
        autoReleaseAt: null,
        updatedAt: new Date(),
      })
      .where(eq(storeOrders.id, orderId))
      .returning();

    logger.info({ orderId, actorId, reason }, "Store order refunded");

    await notify(order.buyerId, "سفارش بازپرداخت شد", "مبلغ سفارش به کیف پول شما بازگردانده شد.", orderId);
    if (order.sellerId) {
      await notify(order.sellerId, "سفارش بازپرداخت شد", "سفارش مربوط به کالای شما بازپرداخت شد.", orderId);
    }
    return updated;
  });
}

/** Buyer or seller opens a dispute (funds stay in escrow until admin resolves). */
export async function openDispute(orderId: string, actorId: string, reason: string) {
  await ensureStoreOrderLifecycleSchema();
  const [order] = await db
    .select()
    .from(storeOrders)
    .where(eq(storeOrders.id, orderId))
    .limit(1);
  if (!order) throw new StoreError("سفارش یافت نشد", 404);
  if (order.buyerId !== actorId && order.sellerId !== actorId) {
    throw new StoreError("شما اجازه این عمل را ندارید", 403);
  }
  if (!["paid_escrow", "delivered"].includes(order.status)) {
    throw new StoreError("این سفارش قابل اعتراض نیست", 409);
  }
  const [updated] = await db
    .update(storeOrders)
    .set({ status: "disputed", disputeReason: reason, autoReleaseAt: null, updatedAt: new Date() })
    .where(eq(storeOrders.id, orderId))
    .returning();

  // Notify the other party that a dispute was opened.
  const otherParty = order.buyerId === actorId ? order.sellerId : order.buyerId;
  await notify(otherParty, "اعتراض ثبت شد", "برای یکی از سفارش‌ها اعتراض ثبت شد و در حال بررسی توسط تیم Flexa است.", orderId);
  return updated;
}

/** Process expired escrow deadlines; safe to run repeatedly from cron. */
export async function processStoreOrderDeadlines(limit = 50) {
  await ensureStoreOrderLifecycleSchema();
  const now = new Date();
  const [undelivered, awaitingConfirmation] = await Promise.all([
    db.select({ id: storeOrders.id }).from(storeOrders).where(and(
      eq(storeOrders.status, "paid_escrow"),
      lte(storeOrders.deliveryDeadlineAt, now),
    )).limit(limit),
    db.select({ id: storeOrders.id }).from(storeOrders).where(and(
      eq(storeOrders.status, "delivered"),
      lte(storeOrders.autoReleaseAt, now),
    )).limit(limit),
  ]);
  const expiredOffers = await db.update(storeOffers).set({ status: "expired", respondedAt: now, updatedAt: now })
    .where(and(eq(storeOffers.status, "pending"), lte(storeOffers.expiresAt, now)))
    .returning({ id: storeOffers.id });
  let refunded = 0;
  let released = 0;
  for (const order of undelivered) {
    try {
      await refundOrder(order.id, "system", "مهلت تحویل ۲۴ ساعته تمام شد", true);
      refunded += 1;
    } catch (error) {
      logger.warn({ error, orderId: order.id }, "Automatic store delivery-timeout refund failed");
    }
  }
  for (const order of awaitingConfirmation) {
    try {
      await confirmAndRelease(order.id, "system", true);
      released += 1;
    } catch (error) {
      logger.warn({ error, orderId: order.id }, "Automatic store escrow release failed");
    }
  }
  return { checked: undelivered.length + awaitingConfirmation.length, refunded, released, expiredOffers: expiredOffers.length };
}

// =========================================================================
// PRICE-NEGOTIATION OFFERS
// =========================================================================

/** Default window (hours) before a pending offer auto-expires. */
const OFFER_TTL_HOURS = 72;

/**
 * Buyer makes a price offer on a user listing. Validates the listing is an
 * active P2P listing the buyer doesn't own, then records a pending offer.
 */
export async function createOffer(params: {
  buyerId: string;
  listingId: string;
  offerToman: number;
  message?: string;
}) {
  const { buyerId, listingId, offerToman, message } = params;

  const [listing] = await db
    .select()
    .from(storeListings)
    .where(eq(storeListings.id, listingId))
    .limit(1);

  if (!listing) throw new StoreError("آگهی یافت نشد", 404);
  if (listing.source !== "user" || !listing.sellerId) {
    throw new StoreError("پیشنهاد قیمت فقط برای آگهی‌های کاربران ممکن است", 409);
  }
  if (listing.status !== "active") throw new StoreError("این آگهی فعال نیست", 409);
  if (listing.sellerId === buyerId) throw new StoreError("نمی‌توانید برای کالای خودتان پیشنهاد بدهید", 409);
  if (listing.stock < 1) throw new StoreError("موجودی کافی نیست", 409);

  const offerRial = BigInt(Math.floor(offerToman)) * BigInt(10);
  if (offerRial <= BigInt(0)) throw new StoreError("مبلغ پیشنهادی نامعتبر است", 400);

  // Prevent spamming the same seller: cap active pending offers per buyer/listing.
  const existing = await db
    .select({ id: storeOffers.id })
    .from(storeOffers)
    .where(
      and(
        eq(storeOffers.listingId, listingId),
        eq(storeOffers.buyerId, buyerId),
        eq(storeOffers.status, "pending")
      )
    );
  if (existing.length > 0) {
    throw new StoreError("شما یک پیشنهاد در حال بررسی برای این آگهی دارید", 409);
  }

  const expiresAt = new Date(Date.now() + OFFER_TTL_HOURS * 60 * 60 * 1000);

  const [offer] = await db
    .insert(storeOffers)
    .values({
      listingId,
      buyerId,
      sellerId: listing.sellerId,
      offerPriceRial: offerRial.toString(),
      listingPriceRial: listing.priceRial,
      message: message ?? null,
      status: "pending",
      expiresAt,
    })
    .returning();

  await notify(
    listing.sellerId,
    "پیشنهاد قیمت جدید",
    `برای «${listing.title}» یک پیشنهاد قیمت ${offerToman.toLocaleString("fa-IR")} USDTی دریافت کردید.`,
    offer.id
  );

  return offer;
}

/**
 * Seller responds to a pending offer.
 *  - "accept": atomically creates an escrow order at the offered price (debits
 *    the buyer's wallet), and rejects all other pending offers on the listing.
 *  - "reject": marks the offer rejected.
 *  - "withdraw" (buyer only): cancels their own pending offer.
 */
export async function respondToOffer(params: {
  offerId: string;
  actorId: string;
  action: "accept" | "reject" | "withdraw";
}) {
  const { offerId, actorId, action } = params;

  return db.transaction(async (tx) => {
    const [offer] = await tx
      .select()
      .from(storeOffers)
      .where(eq(storeOffers.id, offerId))
      .for("update")
      .limit(1);
    if (!offer) throw new StoreError("پیشنهاد یافت نشد", 404);
    if (offer.status !== "pending") throw new StoreError("این پیشنهاد قبلاً بررسی شده است", 409);

    const isSeller = offer.sellerId === actorId;
    const isBuyer = offer.buyerId === actorId;

    if (action === "withdraw") {
      if (!isBuyer) throw new StoreError("شما اجازه این عمل را ندارید", 403);
      const [updated] = await tx
        .update(storeOffers)
        .set({ status: "withdrawn", respondedAt: new Date(), updatedAt: new Date() })
        .where(eq(storeOffers.id, offerId))
        .returning();
      return { offer: updated, order: null };
    }

    if (!isSeller) throw new StoreError("شما اجازه این عمل را ندارید", 403);

    if (offer.expiresAt && offer.expiresAt.getTime() < Date.now()) {
      await tx
        .update(storeOffers)
        .set({ status: "expired", respondedAt: new Date(), updatedAt: new Date() })
        .where(eq(storeOffers.id, offerId));
      throw new StoreError("این پیشنهاد منقضی شده است", 409);
    }

    if (action === "reject") {
      const [updated] = await tx
        .update(storeOffers)
        .set({ status: "rejected", respondedAt: new Date(), updatedAt: new Date() })
        .where(eq(storeOffers.id, offerId))
        .returning();
      await notify(offer.buyerId, "پیشنهاد رد شد", "فروشنده پیشنهاد قیمت شما را رد کرد.", offerId);
      return { offer: updated, order: null };
    }

    // action === "accept" — create the escrow order at the agreed price.
    const order = await createEscrowOrder({
      buyerId: offer.buyerId,
      listingId: offer.listingId,
      quantity: 1,
      buyerNote: "خرید از طریق پیشنهاد قیمت پذیرفته‌شده",
      overrideUnitPriceRial: BigInt(offer.offerPriceRial),
      tx,
    });

    const [updated] = await tx
      .update(storeOffers)
      .set({ status: "accepted", orderId: order.id, respondedAt: new Date(), updatedAt: new Date() })
      .where(eq(storeOffers.id, offerId))
      .returning();

    // Auto-reject any other pending offers on the same listing.
    await tx
      .update(storeOffers)
      .set({ status: "rejected", respondedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(storeOffers.listingId, offer.listingId),
          eq(storeOffers.status, "pending")
        )
      );

    await notify(offer.buyerId, "پیشنهاد پذیرفته شد", "فروشنده پیشنهاد شما را پذیرفت و سفارش ثبت شد.", order.id);
    return { offer: updated, order };
  });
}
