import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, transactions, tournaments, users, wallets } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { bigIntFromText, parseTomanToRial } from "@/lib/money";
import { evaluateUserAchievements } from "@/lib/achievement-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "finance");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [tournamentRows, playerRows, recentPrizes] = await Promise.all([
      db.select({ id: tournaments.id, name: tournaments.name, status: tournaments.status, game: tournaments.game }).from(tournaments).orderBy(desc(tournaments.createdAt)).limit(300),
      db
        .select({
          playerId: players.id,
          playerName: players.displayName,
          playerUsername: players.username,
          userId: users.id,
          userDisplayName: users.displayName,
          phoneNumber: users.phoneNumber,
        })
        .from(players)
        .leftJoin(users, eq(players.visibleUserId, users.id))
        .orderBy(desc(players.createdAt))
        .limit(500),
      db
        .select({
          id: transactions.id,
          amount: transactions.amount,
          status: transactions.status,
          metadata: transactions.metadata,
          createdAt: transactions.createdAt,
          userName: users.displayName,
          username: users.username,
        })
        .from(transactions)
        .leftJoin(wallets, eq(transactions.walletId, wallets.id))
        .leftJoin(users, eq(wallets.userId, users.id))
        .where(eq(transactions.type, "tournament_win"))
        .orderBy(desc(transactions.createdAt))
        .limit(100),
    ]);

    return NextResponse.json({
      tournaments: tournamentRows,
      players: playerRows,
      recentPrizes: recentPrizes.map((tx) => ({
        ...tx,
        amountToman: Number(bigIntFromText(tx.amount) / BigInt(10)),
      })),
    });
  } catch (err) {
    logger.error({ err }, "Admin prizes GET failed");
    return NextResponse.json({ error: "Failed to load prizes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "finance");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const playerId = String(body.playerId || "");
    const tournamentId = String(body.tournamentId || "");
    const reason = String(body.reason || "پرداخت جایزه تورنومنت").slice(0, 300);
    const amountRial = parseTomanToRial(String(body.amountToman || ""));
    if (!playerId || !tournamentId) return NextResponse.json({ error: "بازیکن و تورنومنت الزامی است" }, { status: 400 });
    if (amountRial <= BigInt(0)) return NextResponse.json({ error: "مبلغ جایزه معتبر نیست" }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      const [player] = await tx
        .select({ id: players.id, displayName: players.displayName, ownerId: players.visibleUserId })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      if (!player?.ownerId) throw new Error("بازیکن به کاربر متصل نیست");

      const [tournament] = await tx.select({ id: tournaments.id, name: tournaments.name }).from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
      if (!tournament) throw new Error("تورنومنت پیدا نشد");

      let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, player.ownerId)).limit(1);
      if (!wallet) [wallet] = await tx.insert(wallets).values({ userId: player.ownerId, balance: "0", currency: "RIAL" }).returning();

      await tx.execute(sql`select id from wallets where id = ${wallet.id} for update`);
      const nextBalance = bigIntFromText(wallet.balance) + amountRial;
      await tx.update(wallets).set({ balance: nextBalance.toString(), updatedAt: new Date() }).where(eq(wallets.id, wallet.id));

      const [prizeTx] = await tx
        .insert(transactions)
        .values({
          walletId: wallet.id,
          amount: amountRial.toString(),
          type: "tournament_win",
          status: "completed",
          referenceId: `prize-${tournamentId}-${playerId}-${Date.now()}`,
          metadata: { tournamentId, tournamentName: tournament.name, playerId, playerName: player.displayName, userId: player.ownerId, reason, adminId: auth.user!.id },
        })
        .returning();

      return { prizeTx, player, tournament };
    });

    if (result.player.ownerId) await evaluateUserAchievements(result.player.ownerId).catch(() => undefined);

    await logAdminAction({
      adminId: auth.user.id,
      action: "pay_prize",
      entityType: "transaction",
      entityId: result.prizeTx.id,
      metadata: { tournamentId, playerId, amountRial: amountRial.toString(), reason },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true, transaction: result.prizeTx }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Prize payment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
