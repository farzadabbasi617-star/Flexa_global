import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matches, players, registrations, tournaments, users } from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [player] = await db
      .select({
        id: players.id,
        username: players.username,
        displayName: players.displayName,
        avatarUrl: users.avatarUrl,
        rating: players.rating,
        wins: players.wins,
        losses: players.losses,
        createdAt: players.createdAt,
        flexaId: users.flexaId,
        level: users.level,
        rankPoints: users.rankPoints,
        isVerified: users.isVerified,
        clashRoyaleUsername: users.clashRoyaleUsername,
        codMobileUsername: users.codMobileUsername,
        fortniteUsername: users.fortniteUsername,
      })
      .from(players)
      .leftJoin(users, eq(players.visibleUserId, users.id))
      .where(eq(players.id, id))
      .limit(1);

    if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    const tournamentRows = await db
      .select({
        registrationId: registrations.id,
        registeredAt: registrations.registeredAt,
        tournamentId: tournaments.id,
        tournamentName: tournaments.name,
        game: tournaments.game,
        status: tournaments.status,
        startDate: tournaments.startDate,
      })
      .from(registrations)
      .leftJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
      .where(eq(registrations.playerId, id))
      .orderBy(desc(registrations.registeredAt))
      .limit(30);

    const matchRows = await db
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
        completedAt: matches.completedAt,
        createdAt: matches.createdAt,
      })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .where(or(eq(matches.player1Id, id), eq(matches.player2Id, id)))
      .orderBy(desc(matches.createdAt))
      .limit(50);

    const totalMatches = player.wins + player.losses;
    const winRate = totalMatches > 0 ? Math.round((player.wins / totalMatches) * 100) : 0;

    return NextResponse.json({
      player: { ...player, totalMatches, winRate },
      tournaments: tournamentRows,
      matches: matchRows,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load player" }, { status: 500 });
  }
}
