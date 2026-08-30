import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications, transactions, users, wallets } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { createWalletReference } from "@/lib/wallet-security";
import { bigIntFromText, rialToTomanNumber } from "@/lib/money";
import { walletBreakdown } from "@/lib/wallet-accounting";
import { notifyLinkedUserOnTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function toBigIntSafe(value: string | null | undefined) {
  try {
    return BigInt(value || "0");
  } catch {
    return BigInt(0);
  }
}

function tomanToRial(value: unknown) {
  const normalized = String(value ?? "0").replace(/[،,\s]/g, "");
  const toman = Number(normalized);
  if (!Number.isFinite(toman) || toman <= 0) throw new Error("مبلغ معتبر نیست");
  return BigInt(Math.round(toman)) * BigInt(10);
}

function metadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

async function walletBalanceColumnType(tx: any): Promise<string> {
  const result = await tx.execute(sql`
    select data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'wallets' and column_name = 'balance'
    limit 1
  `);
  return String(result?.rows?.[0]?.data_type || "numeric");
}

async function updateWalletBalanceSafely(tx: any, walletId: string, amountRial: bigint, direction: "increase" | "decrease") {
  const amount = amountRial.toString();
  const now = new Date();
  const balanceType = await walletBalanceColumnType(tx);
  const isTextBalance = balanceType === "text" || balanceType === "character varying";

  const result = direction === "increase"
    ? isTextBalance
      ? await tx.execute(sql`
          update wallets
          set balance = ((balance)::numeric + ${amount}::numeric)::text,
              updated_at = ${now}
          where id = ${walletId}
          returning id, user_id, balance, currency, updated_at
        `)
      : await tx.execute(sql`
          update wallets
          set balance = (balance)::numeric + ${amount}::numeric,
              updated_at = ${now}
          where id = ${walletId}
          returning id, user_id, balance, currency, updated_at
        `)
    : isTextBalance
      ? await tx.execute(sql`
          update wallets
          set balance = ((balance)::numeric - ${amount}::numeric)::text,
              updated_at = ${now}
          where id = ${walletId} and (balance)::numeric >= ${amount}::numeric
          returning id, user_id, balance, currency, updated_at
        `)
      : await tx.execute(sql`
          update wallets
          set balance = (balance)::numeric - ${amount}::numeric,
              updated_at = ${now}
          where id = ${walletId} and (balance)::numeric >= ${amount}::numeric
          returning id, user_id, balance, currency, updated_at
        `);

  return result?.rows?.[0] || null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "wallets");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const walletRows = await db
      .select({
        walletId: wallets.id,
        userId: users.id,
        displayName: users.displayName,
        username: users.username,
        phoneNumber: users.phoneNumber,
        role: users.role,
        balance: wallets.balance,
        currency: wallets.currency,
        updatedAt: wallets.updatedAt,
      })
      .from(users)
      .leftJoin(wallets, eq(wallets.userId, users.id))
      .orderBy(desc(users.createdAt));

    const allTransactions = await db.select().from(transactions);

    const walletsPayload = walletRows.map((row) => {
      const rial = toBigIntSafe(row.balance);
      const userWalletTxs = row.walletId ? allTransactions.filter((tx) => tx.walletId === row.walletId) : [];
      const breakdown = walletBreakdown(rial, userWalletTxs);
      return {
        ...row,
        balanceRial: rial.toString(),
        balanceToman: Number(rial / BigInt(10)),
        usableToman: breakdown.usableToman,
        withdrawableToman: breakdown.withdrawableToman,
        nonWithdrawableToman: breakdown.nonWithdrawableToman,
      };
    });

    const userByWallet = new Map(walletRows.filter((row) => row.walletId).map((row) => [row.walletId, row]));
    const pendingTransactions = allTransactions
      .filter((tx) => (tx.type === "deposit" || tx.type === "withdrawal") && tx.status === "pending")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((tx) => {
        const userRow = userByWallet.get(tx.walletId);
        const amountRial = bigIntFromText(tx.amount);
        return {
          id: tx.id,
          walletId: tx.walletId,
          userId: userRow?.userId || null,
          displayName: userRow?.displayName || "—",
          username: userRow?.username || null,
          phoneNumber: userRow?.phoneNumber || null,
          type: tx.type,
          status: tx.status,
          amountRial: amountRial.toString(),
          amountToman: rialToTomanNumber(amountRial),
          referenceId: tx.referenceId,
          metadata: tx.metadata,
          createdAt: tx.createdAt,
        };
      });

    return NextResponse.json({ wallets: walletsPayload, pendingTransactions });
  } catch {
    return NextResponse.json({ error: "Failed to load wallets" }, { status: 500 });
  }
}

async function handlePendingTransaction(request: NextRequest, authUserId: string, body: Record<string, unknown>) {
  const transactionId = String(body.transactionId || "");
  const decision = body.decision === "reject" ? "reject" : "approve";
  const adminNote = String(body.adminNote || "").slice(0, 300);
  const paymentTrackingNumber = String(body.paymentTrackingNumber || "").slice(0, 120);
  if (!transactionId) throw new Error("transactionId required");

  const result = await db.transaction(async (tx) => {
    const [pending] = await tx.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!pending) throw new Error("درخواست پیدا نشد");
    if (pending.status !== "pending") throw new Error("این درخواست قبلاً بررسی شده است");
    if (pending.type !== "deposit" && pending.type !== "withdrawal") throw new Error("نوع درخواست قابل بررسی نیست");

    const meta = metadataObject(pending.metadata);
    const nextMeta = {
      ...meta,
      reviewedBy: authUserId,
      reviewedAt: new Date().toISOString(),
      adminNote: adminNote || null,
      paymentTrackingNumber: paymentTrackingNumber || null,
    };

    const amountRial = bigIntFromText(pending.amount);
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.id, pending.walletId)).limit(1);
    if (!wallet) throw new Error("کیف پول پیدا نشد");

    if (decision === "reject") {
      const [updatedTx] = await tx
        .update(transactions)
        .set({ status: "cancelled", metadata: nextMeta, updatedAt: new Date() })
        .where(eq(transactions.id, pending.id))
        .returning();

      await tx.insert(notifications).values({
        userId: wallet.userId,
        type: "wallet",
        title: pending.type === "withdrawal" ? "درخواست برداشت رد شد" : "درخواست شارژ رد شد",
        message: adminNote || (pending.type === "withdrawal" ? "درخواست برداشت شما توسط مدیریت رد شد." : "درخواست شارژ شما توسط مدیریت رد شد."),
        link: "/wallet",
      });

      return { transaction: updatedTx, wallet, userId: wallet.userId };
    }

    const updatedWallet = await updateWalletBalanceSafely(tx, wallet.id, amountRial, pending.type === "deposit" ? "increase" : "decrease");

    if (!updatedWallet) throw new Error("موجودی کافی نیست یا کیف پول بروزرسانی نشد");

    const [updatedTx] = await tx
      .update(transactions)
      .set({ status: "completed", metadata: nextMeta, updatedAt: new Date() })
      .where(eq(transactions.id, pending.id))
      .returning();

    await tx.insert(notifications).values({
      userId: wallet.userId,
      type: "wallet",
      title: pending.type === "withdrawal" ? "برداشت با موفقیت پرداخت شد" : "شارژ کیف پول تأیید شد",
      message: pending.type === "withdrawal"
        ? `درخواست برداشت شما تأیید شد و پرداخت بانکی انجام شد.${paymentTrackingNumber ? ` شماره پیگیری: ${paymentTrackingNumber}` : ""}`
        : "درخواست شارژ شما تأیید و به موجودی کیف پول اضافه شد.",
      link: "/wallet",
    });

    return { transaction: updatedTx, wallet: updatedWallet, userId: wallet.userId };
  });

  await logAdminAction({
    adminId: authUserId,
    action: decision === "approve" ? "wallet_request_approved" : "wallet_request_rejected",
    entityType: "wallet_transaction",
    entityId: transactionId,
    metadata: { decision, adminNote, paymentTrackingNumber },
    ipAddress: getClientIp(request.headers),
  });

  return result;
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "wallets");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();

    if (body.transactionId) {
      const result = await handlePendingTransaction(request, auth.user.id, body);
      const tx = result.transaction;
      const amount = rialToTomanNumber(bigIntFromText(tx.amount)).toLocaleString("fa-IR");
      const isApproved = tx.status === "completed";
      const title = tx.type === "withdrawal"
        ? (isApproved ? "برداشت کیف پول پرداخت شد" : "درخواست برداشت رد شد")
        : (isApproved ? "شارژ کیف پول تأیید شد" : "درخواست شارژ رد شد");
      const detail = tx.type === "withdrawal"
        ? (isApproved ? `مبلغ ${amount} USDT برای شما پرداخت شد.` : `درخواست برداشت ${amount} USDT تأیید نشد.`)
        : (isApproved ? `مبلغ ${amount} USDT به کیف پول شما اضافه شد.` : `درخواست شارژ ${amount} USDT تأیید نشد.`);
      await notifyLinkedUserOnTelegram(
        result.userId,
        `💳 <b>${title}</b>

${detail}${body.adminNote ? `

یادداشت ادمین: ${String(body.adminNote).slice(0, 250)}` : ""}`,
        { inline_keyboard: [[{ text: "مشاهده کیف پول", url: `${process.env.APP_URL || "https://www.flexa1.ir"}/wallet` }]] }
      );
      return NextResponse.json({ success: true, ...result });
    }

    const userId = String(body.userId || "");
    const direction = body.direction === "decrease" ? "decrease" : "increase";
    const reason = String(body.reason || "اصلاح دستی توسط مدیریت").slice(0, 300);
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const amountRial = tomanToRial(body.amountToman);

    const result = await db.transaction(async (tx) => {
      await tx
        .insert(wallets)
        .values({ userId, balance: "0", currency: "RIAL" })
        .onConflictDoNothing({ target: wallets.userId });

      const [before] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
      if (!before) throw new Error("کیف پول پیدا نشد");
      const current = toBigIntSafe(before.balance);

      const updated = await updateWalletBalanceSafely(tx, before.id, amountRial, direction);

      if (!updated) throw new Error("موجودی کافی نیست");

      await tx.insert(transactions).values({
        walletId: updated.id,
        amount: amountRial.toString(),
        type: direction === "increase" ? "deposit" : "withdrawal",
        status: "completed",
        referenceId: createWalletReference("admin"),
        metadata: {
          kind: "admin_adjustment",
          direction,
          withdrawable: false,
          reason,
          adminId: auth.user!.id,
          previousBalance: current.toString(),
          nextBalance: updated.balance,
        },
      });

      return updated;
    });

    await logAdminAction({
      adminId: auth.user.id,
      action: direction === "increase" ? "wallet_increase" : "wallet_decrease",
      entityType: "wallet",
      entityId: result.id,
      metadata: { userId, amountRial: amountRial.toString(), reason },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true, wallet: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Wallet update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
