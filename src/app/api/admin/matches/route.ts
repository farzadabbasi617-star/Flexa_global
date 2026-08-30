import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { disputes, judgments, matchEvidence, matches, players, tournaments } from "@/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const STATUS_VALUES = ["pending", "in_progress", "awaiting_judgment", "completed", "disputed"] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "matches");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const player1 = alias(players, "player1");
    const player2 = alias(players, "player2");
    const winner = alias(players, "winner");

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
        scheduledAt: matches.scheduledAt,
        completedAt: matches.completedAt,
        createdAt: matches.createdAt,
        player1Name: player1.displayName,
        player2Name: player2.displayName,
        winnerName: winner.displayName,
      })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .leftJoin(player1, eq(matches.player1Id, player1.id))
      .leftJoin(player2, eq(matches.player2Id, player2.id))
      .leftJoin(winner, eq(matches.winnerId, winner.id))
      .orderBy(desc(matches.createdAt))
      .limit(300);

    const playerRows = await db
      .select({ id: players.id, displayName: players.displayName, username: players.username })
      .from(players)
      .orderBy(desc(players.createdAt))
      .limit(500);

    return NextResponse.json({ matches: matchRows, players: playerRows, statuses: STATUS_VALUES });
  } catch (err) {
    logger.error({ err }, "Admin matches GET failed");
    return NextResponse.json({ error: "Failed to load matches" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "matches");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updateData: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (!STATUS_VALUES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      updateData.status = body.status;
      if (body.status === "completed") updateData.completedAt = new Date();
    }
    if (body.player1Score !== undefined) updateData.player1Score = body.player1Score === "" || body.player1Score === null ? null : Number(body.player1Score);
    if (body.player2Score !== undefined) updateData.player2Score = body.player2Score === "" || body.player2Score === null ? null : Number(body.player2Score);
    if (body.winnerId !== undefined) updateData.winnerId = body.winnerId || null;
    if (body.scheduledAt !== undefined) updateData.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    const [updated] = await db.update(matches).set(updateData).where(eq(matches.id, id)).returning();

    await logAdminAction({
      adminId: auth.user.id,
      action: "update",
      entityType: "match",
      entityId: id,
      metadata: updateData,
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json(updated);
  } catch (err) {
    logger.error({ err }, "Admin matches PATCH failed");
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "matches");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.transaction(async (tx) => {
      await tx.delete(judgments).where(eq(judgments.matchId, id));
      await tx.delete(disputes).where(eq(disputes.matchId, id));
      await tx.delete(matchEvidence).where(eq(matchEvidence.matchId, id));
      await tx.delete(matches).where(eq(matches.id, id));
    });

    await logAdminAction({
      adminId: auth.user.id,
      action: "delete",
      entityType: "match",
      entityId: String(id),
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin matches DELETE failed");
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
