import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { disputes, judgments, matchEvidence, matchResultClaims, matches, privateTournamentStandings, registrations, tournamentLeaderboardSubmissions, tournaments } from "@/db/schema";
import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { distributeTournamentPrizes, refundTournamentEntryFees } from "@/lib/tournament-finance";
import { publishTournamentToTelegramChannel } from "@/lib/telegram";
import logger from "@/lib/logger";
import { normalizeClashPrivateDraftSettings } from "@/lib/clash-private-tournament";
import { normalizeClash1v1QueueSettings } from "@/lib/clash-1v1";
import { ensurePrivateTournamentAttendanceSchema } from "@/lib/private-tournament-attendance";

export const dynamic = "force-dynamic";

const GAME_VALUES = ["clash_royale", "cod_mobile", "fortnite"] as const;
const FORMAT_VALUES = ["single_elimination", "double_elimination", "round_robin"] as const;
const STATUS_VALUES = ["registration", "in_progress", "completed", "cancelled"] as const;

function normalizeTournamentBody(rawBody: Record<string, unknown>) {
  const body = normalizeClash1v1QueueSettings(normalizeClashPrivateDraftSettings(rawBody));
  const game = String(body.game || "");
  const format = String(body.format || "single_elimination");
  const status = String(body.status || "registration");

  if (!GAME_VALUES.includes(game as (typeof GAME_VALUES)[number])) throw new Error("بازی معتبر نیست");
  if (!FORMAT_VALUES.includes(format as (typeof FORMAT_VALUES)[number])) throw new Error("فرمت معتبر نیست");
  if (!STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) throw new Error("وضعیت معتبر نیست");

  const maxPlayers = Number(body.maxPlayers || 16);
  const serverSlots = Number(body.serverSlots || maxPlayers || 16);
  if (!Number.isFinite(maxPlayers) || maxPlayers < 2) throw new Error("حداکثر بازیکنان معتبر نیست");
  if (!Number.isFinite(serverSlots) || serverSlots < 2) throw new Error("ظرفیت سرور معتبر نیست");

  return {
    name: String(body.name || "").trim(),
    game: game as (typeof GAME_VALUES)[number],
    format: format as (typeof FORMAT_VALUES)[number],
    status: status as (typeof STATUS_VALUES)[number],
    description: body.description ? String(body.description) : null,
    maxPlayers,
    prizePool: body.prizePool ? String(body.prizePool) : null,
    winnersCount: Number(body.winnersCount || 1),
    categoryLabel: body.categoryLabel ? String(body.categoryLabel) : null,
    entryFee: body.entryFee ? String(body.entryFee) : "رایگان",
    gameMode: body.gameMode ? String(body.gameMode) : null,
    mapName: body.mapName ? String(body.mapName) : null,
    serverSlots,
    prize1st: body.prize1st ? String(body.prize1st) : null,
    prize2nd: body.prize2nd ? String(body.prize2nd) : null,
    prize3rd: body.prize3rd ? String(body.prize3rd) : null,
    prize4to10: body.prize4to10 ? String(body.prize4to10) : null,
    rules: body.rules ? String(body.rules) : null,
    bannerUrl: body.bannerUrl ? String(body.bannerUrl) : null,
    roomId: body.roomId ? String(body.roomId) : null,
    roomPassword: body.roomPassword ? String(body.roomPassword) : null,
    lobbyNotes: body.lobbyNotes ? String(body.lobbyNotes) : null,
    roomVisibleAt: body.roomVisibleAt ? new Date(String(body.roomVisibleAt)) : null,
    startDate: body.startDate ? new Date(String(body.startDate)) : null,
    endDate: body.endDate ? new Date(String(body.endDate)) : null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    await ensurePrivateTournamentAttendanceSchema();
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 200), 500);
    const rows = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        game: tournaments.game,
        format: tournaments.format,
        status: tournaments.status,
        description: tournaments.description,
        maxPlayers: tournaments.maxPlayers,
        prizePool: tournaments.prizePool,
        winnersCount: tournaments.winnersCount,
        categoryLabel: tournaments.categoryLabel,
        entryFee: tournaments.entryFee,
        gameMode: tournaments.gameMode,
        mapName: tournaments.mapName,
        serverSlots: tournaments.serverSlots,
        prize1st: tournaments.prize1st,
        prize2nd: tournaments.prize2nd,
        prize3rd: tournaments.prize3rd,
        prize4to10: tournaments.prize4to10,
        rules: tournaments.rules,
        bannerUrl: tournaments.bannerUrl,
        roomId: tournaments.roomId,
        roomPassword: tournaments.roomPassword,
        lobbyNotes: tournaments.lobbyNotes,
        roomVisibleAt: tournaments.roomVisibleAt,
        startDate: tournaments.startDate,
        endDate: tournaments.endDate,
        createdAt: tournaments.createdAt,
        updatedAt: tournaments.updatedAt,
        registrations: count(registrations.id),
        checkedInCount: sql<number>`count(${registrations.id}) FILTER (WHERE ${registrations.checkedInAt} IS NOT NULL)::int`,
        noShowCount: sql<number>`count(${registrations.id}) FILTER (WHERE ${registrations.attendanceStatus} = 'no_show')::int`,
      })
      .from(tournaments)
      .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
      .groupBy(tournaments.id)
      .orderBy(desc(tournaments.createdAt))
      .limit(limit);

    return NextResponse.json(rows);
  } catch (err) {
    logger.error({ err }, "Admin tournaments GET failed");
    return NextResponse.json({ error: "Failed to load tournaments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const values = normalizeTournamentBody(body);
    if (!values.name) return NextResponse.json({ error: "نام تورنومنت الزامی است" }, { status: 400 });

    const [created] = await db.insert(tournaments).values({ ...values, createdById: auth.user.id }).returning();
    await logAdminAction({
      adminId: auth.user.id,
      action: "create",
      entityType: "tournament",
      entityId: created.id,
      metadata: { name: created.name, game: created.game },
      ipAddress: getClientIp(request.headers),
    });

    publishTournamentToTelegramChannel(created).catch((err) => {
      logger.warn({ err, tournamentId: created.id }, "Failed to publish admin-created tournament to Telegram channel");
    });

    // === n8n Integration: Fire tournament.created event ===
    import("@/lib/n8n").then(({ notifyN8nTournamentCreated }) => {
      notifyN8nTournamentCreated(created).catch((err) =>
        logger.warn({ err, tournamentId: created.id }, "n8n tournament.created trigger failed")
      );
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create tournament";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const values = normalizeTournamentBody(body);
    if (!values.name) return NextResponse.json({ error: "نام تورنومنت الزامی است" }, { status: 400 });

    const [before] = await db.select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, id)).limit(1);

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(tournaments)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(tournaments.id, id))
        .returning();

      if (before?.status !== "cancelled" && values.status === "cancelled") {
        await refundTournamentEntryFees(tx, id, auth.user.id);
      }
      if (before?.status !== "completed" && values.status === "completed") {
        await distributeTournamentPrizes(tx, id, auth.user.id);
      }

      return row;
    });

    await logAdminAction({ 
      adminId: auth.user.id,
      action: "update",
      entityType: "tournament",
      entityId: id,
      metadata: { name: values.name, status: values.status },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update tournament";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.transaction(async (tx) => {
      await refundTournamentEntryFees(tx, id, auth.user.id);
      const relatedMatches = await tx.select({ id: matches.id }).from(matches).where(eq(matches.tournamentId, id));
      const matchIds = relatedMatches.map((m) => m.id);
      if (matchIds.length > 0) {
        await tx.delete(judgments).where(inArray(judgments.matchId, matchIds));
        await tx.delete(disputes).where(inArray(disputes.matchId, matchIds));
        await tx.delete(matchEvidence).where(inArray(matchEvidence.matchId, matchIds));
        await tx.delete(matchResultClaims).where(inArray(matchResultClaims.matchId, matchIds));
      }
      await tx.delete(privateTournamentStandings).where(eq(privateTournamentStandings.tournamentId, id));
      await tx.delete(tournamentLeaderboardSubmissions).where(eq(tournamentLeaderboardSubmissions.tournamentId, id));
      await tx.delete(registrations).where(eq(registrations.tournamentId, id));
      await tx.delete(matches).where(eq(matches.tournamentId, id));
      await tx.delete(tournaments).where(eq(tournaments.id, id));
    });

    await logAdminAction({
      adminId: auth.user.id,
      action: "delete",
      entityType: "tournament",
      entityId: String(id),
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin tournament DELETE failed");
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
