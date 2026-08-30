import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matches, notifications, players, registrations, tickets, tournaments, transactions, wallets } from "@/db/schema";
import { desc, eq, inArray, or } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { bigIntFromText, rialToTomanNumber } from "@/lib/money";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const user = await validateSession(token || "", getClientIp(request), request.headers.get("user-agent") || "unknown", request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userPlayers = await db
      .select()
      .from(players)
      .where(eq(players.visibleUserId, user.id))
      .orderBy(desc(players.createdAt));

    const playerIds = userPlayers.map((p) => p.id);

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, user.id)).limit(1);
    const balanceRial = bigIntFromText(wallet?.balance);

    const userNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(10);

    const userTickets = await db
      .select()
      .from(tickets)
      .where(eq(tickets.userId, user.id))
      .orderBy(desc(tickets.createdAt))
      .limit(8);

    const recentTransactions = wallet
      ? await db
          .select()
          .from(transactions)
          .where(eq(transactions.walletId, wallet.id))
          .orderBy(desc(transactions.createdAt))
          .limit(8)
      : [];

    const myRegistrations = playerIds.length
      ? await db
          .select({
            registrationId: registrations.id,
            playerId: registrations.playerId,
            registeredAt: registrations.registeredAt,
            checkedInAt: registrations.checkedInAt,
            tournamentId: tournaments.id,
            tournamentName: tournaments.name,
            game: tournaments.game,
            status: tournaments.status,
            startDate: tournaments.startDate,
            entryFee: tournaments.entryFee,
            bannerUrl: tournaments.bannerUrl,
          })
          .from(registrations)
          .leftJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
          .where(eq(registrations.visibleUserId, user.id))
          .orderBy(desc(registrations.registeredAt))
          .limit(12)
      : [];

    const myMatches = playerIds.length
      ? await db
          .select({
            id: matches.id,
            tournamentId: matches.tournamentId,
            tournamentName: tournaments.name,
            round: matches.round,
            matchNumber: matches.matchNumber,
            player1Id: matches.player1Id,
            player2Id: matches.player2Id,
            winnerId: matches.winnerId,
            player1Score: matches.player1Score,
            player2Score: matches.player2Score,
            status: matches.status,
            scheduledAt: matches.scheduledAt,
            completedAt: matches.completedAt,
            createdAt: matches.createdAt,
          })
          .from(matches)
          .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
          .where(or(inArray(matches.player1Id, playerIds), inArray(matches.player2Id, playerIds)))
          .orderBy(desc(matches.createdAt))
          .limit(12)
      : [];

    const opponentIds = [
      ...new Set(
        myMatches
          .flatMap((m) => [m.player1Id, m.player2Id])
          .filter((id): id is string => Boolean(id) && !playerIds.includes(id as string))
      ),
    ];
    const opponents = opponentIds.length
      ? await db
          .select({ id: players.id, displayName: players.displayName, username: players.username, rating: players.rating })
          .from(players)
          .where(inArray(players.id, opponentIds))
      : [];
    const opponentMap = new Map(opponents.map((p) => [p.id, p]));

    const primaryPlayer = userPlayers[0] || null;
    const totalWins = userPlayers.reduce((sum, p) => sum + p.wins, 0);
    const totalLosses = userPlayers.reduce((sum, p) => sum + p.losses, 0);
    const totalMatches = totalWins + totalLosses;
    const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;

    const upcomingMatches = myMatches.filter((m) => m.status !== "completed");

    const recentActivity = [
      ...userNotifications.slice(0, 4).map((n) => ({
        type: "notification",
        icon: "🔔",
        title: n.title,
        description: n.message,
        link: n.link,
        time: n.createdAt,
      })),
      ...recentTransactions.slice(0, 4).map((tx) => ({
        type: "transaction",
        icon: tx.type === "entry_fee" ? "🎟️" : tx.type === "refund" ? "↩️" : tx.type === "tournament_win" ? "🏆" : "💳",
        title: tx.type,
        description: `${rialToTomanNumber(bigIntFromText(tx.amount)).toLocaleString("fa-IR")} USDT • ${tx.status}`,
        link: "/wallet",
        time: tx.createdAt,
      })),
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);

    return NextResponse.json({
      user: {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        flexaId: user.flexaId,
        level: user.level,
        xp: user.xp,
        rankPoints: user.rankPoints,
      },
      player: primaryPlayer,
      stats: {
        rating: primaryPlayer?.rating ?? user.rankPoints,
        wins: totalWins,
        losses: totalLosses,
        winRate,
        myTournaments: myRegistrations.length,
        upcomingMatches: upcomingMatches.length,
        unreadNotifications: userNotifications.filter((n) => !n.isRead).length,
        openTickets: userTickets.filter((t) => t.status !== "closed" && t.status !== "resolved").length,
      },
      wallet: {
        balanceRial: balanceRial.toString(),
        balanceToman: rialToTomanNumber(balanceRial),
      },
      tournaments: myRegistrations,
      matches: myMatches.map((m) => {
        const myPlayerId = playerIds.includes(m.player1Id || "") ? m.player1Id : m.player2Id;
        const opponentId = myPlayerId === m.player1Id ? m.player2Id : m.player1Id;
        const opponent = opponentId ? opponentMap.get(opponentId) : null;
        return { ...m, myPlayerId, opponent };
      }),
      notifications: userNotifications,
      transactions: recentTransactions.map((tx) => ({
        ...tx,
        amountToman: rialToTomanNumber(bigIntFromText(tx.amount)),
      })),
      tickets: userTickets,
      recentActivity,
    });
  } catch (err) {
    logger.error({ err }, "Dashboard GET failed");
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
