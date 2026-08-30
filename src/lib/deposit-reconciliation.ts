/**
 * Recovers gateway deposits whose callback never arrived.
 *
 * The ZarinPal callback is the only place a deposit is normally credited, and
 * it only runs if the user's browser returns to us. If they close the tab on
 * the bank page, lose signal, or the app is asleep at that moment, the card can
 * already be charged while our row stays "pending" forever: the user paid and
 * got nothing, and nobody finds out. Three such rows had been sitting in
 * production for days when this was written.
 *
 * This sweeps pending deposits and asks the gateway what really happened:
 *   - paid but unverified  -> verify, credit, notify (identical to the callback)
 *   - definitively not paid -> close the row so it stops being ambiguous
 *   - unknown / gateway down -> leave it pending and try again next run
 *
 * Crediting reuses the callback's exact concurrency guard: the row is claimed
 * with a conditional UPDATE (pending -> completed) and only the update that
 * actually changed a row moves the balance. A callback and this sweep racing on
 * the same transaction therefore cannot double-credit.
 */
import { db } from "@/db";
import { transactions, wallets, notifications } from "@/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { inquirePayment, verifyPayment } from "@/lib/cryptopayment";
import { rialToTomanNumber } from "@/lib/money";
import { notifyLinkedUserOnTelegram } from "@/lib/telegram";
import logger from "@/lib/logger";

/**
 * Only look at rows old enough that a live user is not still mid-payment.
 * A ZarinPal authority is valid for well over an hour, so this is deliberately
 * conservative: better to recover late than to fight an in-flight callback.
 */
const MIN_AGE_MINUTES = 15;

/** Stop asking about authorities the gateway has certainly discarded. */
const MAX_AGE_HOURS = 72;

export type ReconciliationDecision = "credit" | "close" | "wait" | "no_authority";

/**
 * Pure decision step, kept separate from the database work so the rules that
 * decide whether to move money can be tested exhaustively.
 *
 * "wait" is the deliberate default: when the gateway is unreachable or the
 * window for the user to finish is still open, doing nothing is always safe,
 * whereas closing a row that was actually paid loses the user's money.
 */
export function decideReconciliation(input: {
  hasAuthority: boolean;
  inquiryOk: boolean;
  paid: boolean;
  createdAt: Date | null;
  now: Date;
}): ReconciliationDecision {
  if (!input.hasAuthority) return "no_authority";
  // Gateway did not give us a usable answer -- never guess about money.
  if (!input.inquiryOk) return "wait";
  if (input.paid) return "credit";
  if (!input.createdAt) return "wait";
  const ageHours = (input.now.getTime() - input.createdAt.getTime()) / 3_600_000;
  return ageHours >= MAX_AGE_HOURS ? "close" : "wait";
}

export interface ReconciliationResult {
  scanned: number;
  recovered: number;
  closed: number;
  skipped: number;
  recoveredToman: number;
  errors: number;
}

export async function reconcilePendingDeposits(limit = 25): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    scanned: 0,
    recovered: 0,
    closed: 0,
    skipped: 0,
    recoveredToman: 0,
    errors: 0,
  };

  const cutoff = new Date(Date.now() - MIN_AGE_MINUTES * 60_000);

  const pending = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "deposit"),
        eq(transactions.status, "pending"),
        lt(transactions.createdAt, cutoff)
      )
    )
    .limit(Math.min(100, Math.max(1, Math.floor(limit))));

  for (const row of pending) {
    result.scanned += 1;
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const authority = typeof meta.authority === "string" ? meta.authority : "";

    // Nothing to ask the gateway about; a row without an authority never made
    // it to ZarinPal at all.
    if (!authority) {
      result.skipped += 1;
      continue;
    }

    try {
      const inquiry = await inquirePayment(authority);

      const decision = decideReconciliation({
        hasAuthority: true,
        inquiryOk: inquiry.ok,
        paid: inquiry.ok ? inquiry.paid : false,
        createdAt: row.createdAt ?? null,
        now: new Date(),
      });

      if (decision === "wait") {
        // Gateway unreachable, or the user may still be finishing. Either way
        // the row stays pending and we look again next cycle.
        if (!inquiry.ok) result.errors += 1;
        else result.skipped += 1;
        continue;
      }

      if (decision === "close") {
        await db
          .update(transactions)
          .set({
            status: "cancelled",
            metadata: {
              ...meta,
              cancelledAt: new Date().toISOString(),
              cancelledBy: "reconciliation",
              gatewayStatus: inquiry.ok ? inquiry.status : "unknown",
            },
            updatedAt: new Date(),
          })
          .where(and(eq(transactions.id, row.id), eq(transactions.status, "pending")));
        result.closed += 1;
        continue;
      }

      // Paid. Verify to settle it properly -- inquiry alone must never credit,
      // because only verify returns the authoritative ref_id and tells ZarinPal
      // the payment is reconciled on our side too.
      const amountRial = BigInt(row.amount);
      const verification = await verifyPayment({ authority, amountRial });

      if (!verification.ok) {
        logger.error(
          { transactionId: row.id, authority, code: verification.code },
          "Reconciliation verify failed for a paid deposit"
        );
        result.errors += 1;
        continue;
      }

      const claimed = await db
        .update(transactions)
        .set({
          status: "completed",
          metadata: {
            ...meta,
            refId: verification.refId,
            cardPan: verification.cardPan ?? null,
            feeRial: verification.feeRial,
            verifiedAt: new Date().toISOString(),
            alreadyVerified: verification.alreadyVerified,
            recoveredBy: "reconciliation",
          },
          updatedAt: new Date(),
        })
        .where(and(eq(transactions.id, row.id), eq(transactions.status, "pending")))
        .returning({ id: transactions.id });

      if (claimed.length === 0) {
        // A callback settled it between our read and our write. Correct outcome,
        // just not ours to count.
        result.skipped += 1;
        continue;
      }

      await db
        .update(wallets)
        .set({
          balance: sql`(${wallets.balance})::numeric + ${amountRial.toString()}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(wallets.id, row.walletId));

      const amountToman = rialToTomanNumber(amountRial);
      result.recovered += 1;
      result.recoveredToman += amountToman;

      const [wallet] = await db.select().from(wallets).where(eq(wallets.id, row.walletId)).limit(1);

      if (wallet) {
        const amountLabel = amountToman.toLocaleString("fa-IR");

        await db.insert(notifications).values({
          userId: wallet.userId,
          type: "wallet",
          title: "شارژ کیف پول تکمیل شد",
          message: `پرداخت ${amountLabel} USDTی شما تأیید و به کیف پول اضافه شد. شماره پیگیری: ${verification.refId}`,
          link: "/wallet",
        });

        // The user thinks this payment failed -- they saw no success page. Say
        // explicitly that it was found and settled. Never allowed to throw: the
        // money is already credited.
        notifyLinkedUserOnTelegram(
          wallet.userId,
          `✅ <b>پرداخت شما پیدا و تأیید شد</b>\n\nمبلغ: <b>${amountLabel} USDT</b>\nشماره پیگیری: <code>${verification.refId}</code>\n\nاین پرداخت به دلیل قطع ارتباط با درگاه ناتمام مانده بود و اکنون به کیف پول شما اضافه شد.`,
          { inline_keyboard: [[{ text: "💳 مشاهده کیف پول", callback_data: "menu:wallet" }]] }
        ).catch((error) => logger.warn({ error }, "Telegram reconciliation notification failed"));
      }

      logger.warn(
        { transactionId: row.id, refId: verification.refId, amountToman },
        "Recovered a paid deposit whose callback never arrived"
      );
    } catch (error) {
      logger.error({ error, transactionId: row.id }, "Deposit reconciliation error");
      result.errors += 1;
    }
  }

  return result;
}
