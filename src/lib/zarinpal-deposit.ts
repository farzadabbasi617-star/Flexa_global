/**
 * Shared "start an online top-up" step for the web wallet and the Telegram bot.
 *
 * Both entry points must create the pending row and request the authority in
 * exactly the same way, because the callback route settles them with one code
 * path. Duplicating this in the bot would be a second place for the amount
 * handling to drift out of sync with what the callback expects.
 *
 * Caller is responsible for authentication: the web route resolves the user
 * from the session cookie, the bot from the linked Telegram account.
 */
import { db } from "@/db";
import { transactions, wallets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rialToTomanNumber } from "@/lib/money";
import { createWalletReference, validateDepositAmountRial } from "@/lib/wallet-security";
import { getCryptoPaymentConfiguration, requestPayment } from "@/lib/cryptopayment";
import logger from "@/lib/logger";

export type StartDepositResult =
  | { ok: true; paymentUrl: string; reference: string; amountToman: number }
  | { ok: false; error: string; status: number };

export async function getOrCreateWalletForUser(userId: string) {
  const [existing] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(wallets)
    .values({ userId, balance: "0", currency: "RIAL" })
    .onConflictDoNothing({ target: wallets.userId })
    .returning();
  if (created) return created;

  const [afterConflict] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return afterConflict ?? null;
}

export async function startCryptoPaymentDeposit(input: {
  userId: string;
  amountRial: bigint;
  mobile?: string | null;
  email?: string | null;
  /** Recorded on the transaction so support can tell bot deposits from web ones. */
  origin: "web" | "telegram";
  telegramId?: string | null;
}): Promise<StartDepositResult> {
  const gateway = getCryptoPaymentConfiguration();
  if (!gateway.live) {
    return {
      ok: false,
      status: 503,
      error: "شارژ کیف پول موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.",
    };
  }

  const amountCheck = validateDepositAmountRial(input.amountRial);
  if (!amountCheck.ok) return { ok: false, status: 400, error: amountCheck.error };

  const wallet = await getOrCreateWalletForUser(input.userId);
  if (!wallet) return { ok: false, status: 500, error: "کیف پول یافت نشد." };

  const reference = createWalletReference("deposit");
  const amountToman = rialToTomanNumber(input.amountRial);

  const [pending] = await db
    .insert(transactions)
    .values({
      walletId: wallet.id,
      amount: input.amountRial.toString(),
      type: "deposit",
      status: "pending",
      referenceId: reference,
      metadata: {
        method: "cryptopayment",
        gateway: "cryptopayment",
        origin: input.origin,
        telegramId: input.telegramId ?? null,
        sandbox: gateway.sandbox,
        amountToman,
        requestedAt: new Date().toISOString(),
      },
    })
    .returning();

  const result = await requestPayment({
    amountRial: input.amountRial,
    description: `شارژ کیف پول Flexa - ${amountToman.toLocaleString("fa-IR")} USDT`,
    callbackUrl: `${gateway.callbackBaseUrl}/api/wallet/deposit/cryptopayment/callback`,
    mobile: input.mobile ?? null,
    email: input.email ?? null,
    orderId: null,
  });

  if (!result.ok) {
    await db
      .update(transactions)
      .set({
        status: "failed",
        metadata: {
          method: "cryptopayment",
          gateway: "cryptopayment",
          origin: input.origin,
          amountToman,
          failedAt: new Date().toISOString(),
          failureReason: result.error,
          gatewayCode: result.code ?? null,
        },
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, pending.id));

    return { ok: false, status: 502, error: result.error };
  }

  await db
    .update(transactions)
    .set({
      metadata: {
        method: "cryptopayment",
        gateway: "cryptopayment",
        origin: input.origin,
        telegramId: input.telegramId ?? null,
        sandbox: gateway.sandbox,
        amountToman,
        authority: result.authority,
        requestedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, pending.id));

  logger.info({ userId: input.userId, reference, amountToman, origin: input.origin }, "ZarinPal deposit initiated");

  return { ok: true, paymentUrl: result.paymentUrl, reference, amountToman };
}
