import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { privateTournamentStandings, tournaments, registrations, matches, players } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole, validateSession } from "@/lib/auth";
import { z } from "zod";
import { distributeTournamentPrizes, refundTournamentEntryFees } from "@/lib/tournament-finance";
import { CLASH_PRIVATE_DRAFT_CATEGORY } from "@/lib/clash-private-tournament";
import { ensureClashPrivateResultsSchema } from "@/lib/clash-private-results";

export const dynamic = "force-dynamic";


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  try {
    const token = request.cookies.get("session")?.value || "";
    const viewer = token
      ? await validateSession(
          token,
          request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown",
          request.headers.get("user-agent") || "unknown",
          request
        )
      : null;

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id)).limit(1);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    const registrationRows = await db
      .select({
        registrationId: registrations.id,
        playerId: registrations.playerId,
        ownerId: registrations.visibleUserId,
        checkedInAt: registrations.checkedInAt,
        registeredAt: registrations.registeredAt,
        playerUsername: players.username,
        playerDisplayName: players.displayName,
        playerAvatarUrl: players.avatarUrl,
        playerRating: players.rating,
        playerWins: players.wins,
        playerLosses: players.losses,
      })
      .from(registrations)
      .leftJoin(players, eq(registrations.playerId, players.id))
      .where(eq(registrations.tournamentId, id));

    const isAdmin = viewer?.role === "admin" || viewer?.role === "super_admin";
    const myRegistration = viewer ? registrationRows.find((row) => row.ownerId === viewer.id) : null;
    const isRegistered = Boolean(myRegistration);
    const accessEligible = tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY
      ? Boolean(myRegistration?.checkedInAt)
      : isRegistered;
    const now = Date.now();
    const credentialsReady = Boolean(
      isAdmin ||
      (accessEligible && (
        tournament.status === "in_progress" ||
        (tournament.roomVisibleAt && now >= new Date(tournament.roomVisibleAt).getTime()) ||
        (tournament.startDate && now >= new Date(tournament.startDate).getTime() - 30 * 60 * 1000)
      ))
    );

    const publicRegistrations = registrationRows.map((row) => {
      const isOwner = Boolean(viewer && row.ownerId === viewer.id);
      return {
        registration: {
          id: row.registrationId,
          playerId: row.playerId,
          checkedInAt: row.checkedInAt,
          registeredAt: row.registeredAt,
          isOwner,
        },
        player: row.playerId ? {
          id: row.playerId,
          username: row.playerUsername,
          displayName: row.playerDisplayName,
          avatarUrl: row.playerAvatarUrl,
          rating: row.playerRating,
          wins: row.playerWins,
          losses: row.playerLosses,
          isOwner,
        } : null,
      };
    });

    const tournamentMatches = await db
      .select({
        id: matches.id,
        tournamentId: matches.tournamentId,
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
      .where(eq(matches.tournamentId, id))
      .orderBy(matches.round, matches.matchNumber);

    let leaderboard: Array<{ rank: number; playerName: string; score: number | null; verified: boolean }> = [];
    if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
      await ensureClashPrivateResultsSchema();
      leaderboard = await db
        .select({
          rank: privateTournamentStandings.rank,
          playerName: privateTournamentStandings.playerName,
          score: privateTournamentStandings.score,
          verified: privateTournamentStandings.verified,
        })
        .from(privateTournamentStandings)
        .where(eq(privateTournamentStandings.tournamentId, id))
        .orderBy(privateTournamentStandings.rank);
    }

    const { roomId, roomPassword, lobbyNotes, createdById: _createdById, ...publicTournament } = tournament;
    void _createdById;
    return NextResponse.json({
      ...publicTournament,
      roomId: credentialsReady ? roomId : null,
      roomPassword: credentialsReady ? roomPassword : null,
      lobbyNotes: credentialsReady ? lobbyNotes : null,
      registrations: publicRegistrations,
      matches: tournamentMatches,
      leaderboard,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch tournament" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Only admins may change a tournament's status.
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  try {
    const body = await request.json();
    const { status } = body;

    const [before] = await db.select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, id)).limit(1);

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(tournaments)
        .set({ status, updatedAt: new Date() })
        .where(eq(tournaments.id, id))
        .returning();

      if (before?.status !== "cancelled" && status === "cancelled") {
        await refundTournamentEntryFees(tx, id, auth.user.id);
      }
      if (before?.status !== "completed" && status === "completed") {
        await distributeTournamentPrizes(tx, id, auth.user.id);
      }

      return row;
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update tournament" }, { status: 500 });
  }
}
