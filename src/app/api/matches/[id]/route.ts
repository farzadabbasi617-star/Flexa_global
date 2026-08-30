import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matches, notifications, players } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { evaluateUserAchievements } from "@/lib/achievement-service";
import { payoutClash1v1Prize } from "@/lib/clash-1v1";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

async function notifyMatchParticipants(matchId: string, title: string, message: string, link: string) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return;

  const playerIds = [match.player1Id, match.player2Id].filter(Boolean) as string[];
  if (playerIds.length === 0) return;

  const playerRows = await db
    .select({ ownerId: players.visibleUserId })
    .from(players)
    .where(eq(players.id, playerIds[0]));

  if (playerIds.length > 1) {
    const moreRows = await db
      .select({ ownerId: players.visibleUserId })
      .from(players)
      .where(eq(players.id, playerIds[1]));
    playerRows.push(...moreRows);
  }

  const userIds = [...new Set(playerRows.map((p) => p.ownerId).filter(Boolean) as string[])];
  if (userIds.length === 0) return;

  await db.insert(notifications).values(userIds.map((userId) => ({ userId, type: "match_result", title, message, link })));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Recording scores / results and adjusting ratings is privileged — only
  // admins, super_admins or judges may do it.
  const auth = await requireRole(request, ["admin", "super_admin", "judge", "moderator"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  try {
    const body = await request.json();
    const { player1Score, player2Score, winnerId, status } = body;

    // Read the current match first so we can tell whether this request is the
    // transition that *completes* the match. This makes result-application
    // idempotent: rating/stats and bracket advancement run exactly once, even
    // if the endpoint is called again (or AI judging already completed it).
    const [before] = await db.select().from(matches).where(eq(matches.id, id));
    if (!before) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const wasCompleted = before.status === "completed";

    const updateData: Record<string, unknown> = {};
    if (player1Score !== undefined) updateData.player1Score = player1Score;
    if (player2Score !== undefined) updateData.player2Score = player2Score;
    if (winnerId !== undefined) updateData.winnerId = winnerId;
    if (status !== undefined) updateData.status = status;
    if (status === "completed" && !wasCompleted) updateData.completedAt = new Date();

    const [updated] = await db
      .update(matches)
      .set(updateData)
      .where(eq(matches.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // Only apply side-effects on the first transition into "completed".
    if (status === "completed" && !wasCompleted && winnerId) {
      const match = updated;
      const nextRound = match.round + 1;
      const nextMatchNumber = Math.ceil(match.matchNumber / 2);

      // Find next round match
      const [nextMatch] = await db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.tournamentId, match.tournamentId),
            eq(matches.round, nextRound),
            eq(matches.matchNumber, nextMatchNumber)
          )
        );

      if (nextMatch) {
        // Determine slot: odd match numbers go to player1, even to player2
        const isPlayer1Slot = match.matchNumber % 2 === 1;
        const slotUpdate = isPlayer1Slot
          ? { player1Id: winnerId }
          : { player2Id: winnerId };

        await db
          .update(matches)
          .set(slotUpdate)
          .where(eq(matches.id, nextMatch.id));
      }

      // Update player stats
      if (match.player1Id && match.player2Id) {
        const loserId =
          winnerId === match.player1Id ? match.player2Id : match.player1Id;

        // Winner stats
        const [winner] = await db
          .select()
          .from(players)
          .where(eq(players.id, winnerId));
        if (winner) {
          await db
            .update(players)
            .set({
              wins: winner.wins + 1,
              rating: winner.rating + 25,
            })
            .where(eq(players.id, winnerId));
        }

        // Loser stats
        const [loser] = await db
          .select()
          .from(players)
          .where(eq(players.id, loserId));
        if (loser) {
          await db
            .update(players)
            .set({
              losses: loser.losses + 1,
              rating: Math.max(0, loser.rating - 15),
            })
            .where(eq(players.id, loserId));
        }

        if (winner?.visibleUserId) await evaluateUserAchievements(winner.visibleUserId).catch(() => undefined);
        if (loser?.visibleUserId) await evaluateUserAchievements(loser.visibleUserId).catch(() => undefined);
      }

      await db.transaction(async (tx) => payoutClash1v1Prize(tx, id, winnerId)).catch((err) => {
        logger.warn({ err, matchId: id, winnerId }, "Failed to payout Clash 1V1 prize from match PATCH");
      });

      await notifyMatchParticipants(
        id,
        "نتیجه مسابقه نهایی شد",
        `نتیجه مسابقه شما ثبت و نهایی شد.`,
        `/tournaments/${match.tournamentId}`
      ).catch(() => undefined);
    } else if (status === "awaiting_judgment") {
      await notifyMatchParticipants(
        id,
        "مسابقه در انتظار داوری",
        "نتیجه مسابقه ثبت شد و در انتظار بررسی داور است.",
        `/tournaments/${updated.tournamentId}`
      ).catch(() => undefined);
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update match" }, { status: 500 });
  }
}
