import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { disputes, judgments, matchEvidence, matchResultClaims, matches, registrations, tournaments } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { generateSingleEliminationMatches, shuffle } from "@/lib/brackets";
import logger from "@/lib/logger";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { notifyTournamentParticipantsOnTelegram } from "@/lib/telegram";
import { CLASH_PRIVATE_DRAFT_CATEGORY } from "@/lib/clash-private-tournament";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Only admins may (re)generate brackets — this deletes existing matches.
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const inserted = await db.transaction(async (tx) => {
      // Serialize bracket generation for this tournament, so two admin clicks
      // cannot interleave delete/insert/update operations.
      await tx.execute(sql`SELECT id FROM tournaments WHERE id = ${id} FOR UPDATE`);

      const [tournament] = await tx
        .select({ id: tournaments.id, name: tournaments.name, status: tournaments.status, categoryLabel: tournaments.categoryLabel })
        .from(tournaments)
        .where(eq(tournaments.id, id));

      if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
      if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) throw new Error("CLASH_PRIVATE_USES_GAME_LEADERBOARD");
      if (tournament.status === "completed") throw new Error("TOURNAMENT_COMPLETED");

      const regs = await tx
        .select({ playerId: registrations.playerId })
        .from(registrations)
        .where(eq(registrations.tournamentId, id));

      if (regs.length < 2) throw new Error("NOT_ENOUGH_PLAYERS");

      const playerIds = shuffle(regs.map((r) => r.playerId));
      const newMatches = generateSingleEliminationMatches(playerIds).map((m) => ({
        ...m,
        tournamentId: id,
      }));

      const oldMatches = await tx.select({ id: matches.id }).from(matches).where(eq(matches.tournamentId, id));
      const oldMatchIds = oldMatches.map((m) => m.id);

      if (oldMatchIds.length > 0) {
        // FK-safe cleanup. Without this, deleting matches that already have
        // judgments/evidence/disputes can fail or leave inconsistent state.
        await tx.delete(judgments).where(inArray(judgments.matchId, oldMatchIds));
        await tx.delete(disputes).where(inArray(disputes.matchId, oldMatchIds));
        await tx.delete(matchEvidence).where(inArray(matchEvidence.matchId, oldMatchIds));
        await tx.delete(matchResultClaims).where(inArray(matchResultClaims.matchId, oldMatchIds));
      }

      await tx.delete(matches).where(eq(matches.tournamentId, id));
      const rows = await tx.insert(matches).values(newMatches).returning();

      await tx
        .update(tournaments)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(tournaments.id, id));

      return { rows, tournamentName: tournament.name };
    });

    await logAdminAction({
      adminId: auth.user.id,
      action: "generate_brackets",
      entityType: "tournament",
      entityId: id,
      metadata: { matchesCreated: inserted.rows.length },
      ipAddress: getClientIp(request.headers),
    });

    await notifyTournamentParticipantsOnTelegram(
      id,
      `🔥 <b>براکت تورنومنت ساخته شد</b>

🏆 ${inserted.tournamentName}

مسابقات شروع شده‌اند. وارد Flexa شو و رقیب/زمان بازی را ببین.`,
      { inline_keyboard: [[{ text: "مشاهده براکت", url: `${process.env.APP_URL || "https://www.flexa1.ir"}/tournaments/${id}/lobby` }]] }
    ).catch(() => undefined);

    return NextResponse.json(inserted.rows, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    if (message === "TOURNAMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    if (message === "NOT_ENOUGH_PLAYERS") {
      return NextResponse.json({ error: "Need at least 2 players" }, { status: 400 });
    }
    if (message === "TOURNAMENT_COMPLETED") {
      return NextResponse.json({ error: "Completed tournaments cannot be regenerated" }, { status: 409 });
    }
    if (message === "CLASH_PRIVATE_USES_GAME_LEADERBOARD") {
      return NextResponse.json({ error: "این مود از Leaderboard مسابقه خصوصی Clash Royale استفاده می‌کند و براکت حذفی ندارد." }, { status: 409 });
    }

    logger.error({ err: e }, "Failed to generate brackets");
    return NextResponse.json({ error: "Failed to generate brackets" }, { status: 500 });
  }
}
