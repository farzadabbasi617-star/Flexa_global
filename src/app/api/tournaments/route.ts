import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, registrations } from "@/db/schema";
import { desc, eq, count } from "drizzle-orm";
import { requireRole, validateSession } from "@/lib/auth";
import { publishTournamentToTelegramChannel } from "@/lib/telegram";
import { publicCacheHeaders, ttlCache } from "@/lib/server-cache";
import logger from "@/lib/logger";
import { safePagination } from "@/lib/pagination";
import { normalizeClashPrivateDraftSettings } from "@/lib/clash-private-tournament";
import { normalizeClash1v1QueueSettings } from "@/lib/clash-1v1";

export const dynamic = "force-dynamic";

function publicTournamentPayload<T extends Record<string, unknown>>(tournament: T) {
  const {
    roomId: _roomId,
    roomPassword: _roomPassword,
    lobbyNotes: _lobbyNotes,
    createdById: _createdById,
    ...safe
  } = tournament;
  void _roomId; void _roomPassword; void _lobbyNotes; void _createdById;
  return safe;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const game = searchParams.get("game");
  const { page, limit: safeLimit, offset } = safePagination({
    page: searchParams.get("page"),
    limit: searchParams.get("limit"),
    defaultLimit: 10,
    maxLimit: 100,
  });
  const token = request.cookies.get("session")?.value;
  const isPublicRequest = !token;
  const cacheKey = `tournaments:${game || "all"}:${page}:${safeLimit}`;

  try {
    if (isPublicRequest) {
      const payload = await ttlCache(cacheKey, 30_000, async () => {
        const whereClause = game && ["clash_royale", "cod_mobile", "fortnite"].includes(game)
          ? eq(tournaments.game, game as "clash_royale" | "cod_mobile" | "fortnite")
          : undefined;
        const [totalResult] = await db.select({ value: count() }).from(tournaments).where(whereClause);
        const results = await db
          .select({ tournament: tournaments, registeredCount: count(registrations.id) })
          .from(tournaments)
          .leftJoin(registrations, eq(tournaments.id, registrations.tournamentId))
          .where(whereClause)
          .groupBy(tournaments.id)
          .orderBy(desc(tournaments.createdAt))
          .limit(safeLimit)
          .offset((page - 1) * safeLimit);
        return {
          data: results.map(({ tournament, registeredCount }) => ({
            ...publicTournamentPayload(tournament),
            registeredCount,
            isRegistered: false,
            myPlayerId: null,
          })),
          pagination: { total: totalResult.value, page, limit: safeLimit, totalPages: Math.ceil(totalResult.value / safeLimit) },
        };
      });
      return NextResponse.json(payload, { headers: publicCacheHeaders(30, 120) });
    }
    // 1. Get total count for pagination
    const [totalResult] = await db
      .select({ value: count() })
      .from(tournaments)
      .where(
        game && ["clash_royale", "cod_mobile", "fortnite"].includes(game)
          ? eq(tournaments.game, game as "clash_royale" | "cod_mobile" | "fortnite")
          : undefined
      );

    // 2. Get paginated results with JOIN to avoid N+1
    const results = await db
      .select({
        tournament: tournaments,
        registeredCount: count(registrations.id),
      })
      .from(tournaments)
      .leftJoin(registrations, eq(tournaments.id, registrations.tournamentId))
      .where(
        game && ["clash_royale", "cod_mobile", "fortnite"].includes(game)
          ? eq(tournaments.game, game as "clash_royale" | "cod_mobile" | "fortnite")
          : undefined
      )
      .groupBy(tournaments.id)
      .orderBy(desc(tournaments.createdAt))
      .limit(safeLimit)
      .offset(offset);

    let registeredTournamentIds = new Set<string>();
    let registeredPlayerByTournament = new Map<string, string>();

    if (token) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
      const ua = request.headers.get("user-agent") || "unknown";
      const user = await validateSession(token, ip, ua, request);
      if (user) {
        const myRegistrations = await db
          .select({ tournamentId: registrations.tournamentId, playerId: registrations.playerId })
          .from(registrations)
          .where(eq(registrations.visibleUserId, user.id));
        registeredTournamentIds = new Set(myRegistrations.map((reg) => reg.tournamentId));
        registeredPlayerByTournament = new Map(myRegistrations.map((reg) => [reg.tournamentId, reg.playerId]));
      }
    }

    const formattedResults = results.map(({ tournament, registeredCount }) => ({
      ...publicTournamentPayload(tournament),
      registeredCount,
      isRegistered: registeredTournamentIds.has(tournament.id),
      myPlayerId: registeredPlayerByTournament.get(tournament.id) || null,
    }));

    return NextResponse.json({
      data: formattedResults,
      pagination: {
        total: totalResult.value,
        page,
        limit: safeLimit,
        totalPages: Math.ceil(totalResult.value / safeLimit),
      },
    });
  } catch (err) {
    console.error("Fetch tournaments error:", err);
    return NextResponse.json({ error: "Failed to fetch tournaments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Only admins may create tournaments.
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = normalizeClash1v1QueueSettings(normalizeClashPrivateDraftSettings(await request.json()));
    const {
      name, game, format, description, maxPlayers, prizePool, rules, startDate, endDate,
      entryFee, gameMode, mapName, serverSlots, winnersCount, categoryLabel,
      prize1st, prize2nd, prize3rd, prize4to10, bannerUrl, lobbyNotes
    } = body;

    if (!name || !game) {
      return NextResponse.json({ error: "Name and game are required" }, { status: 400 });
    }

    const [tournament] = await db
      .insert(tournaments)
      .values({
        name,
        game,
        format: format || "single_elimination",
        description: description || null,
        maxPlayers: maxPlayers || 16,
        prizePool: prizePool || null,
        winnersCount: winnersCount || 1,
        categoryLabel: categoryLabel || null,
        entryFee: entryFee || "رایگان",
        gameMode: gameMode || null,
        mapName: mapName || null,
        serverSlots: serverSlots || maxPlayers || 16,
        createdById: auth.user.id,
        prize1st: prize1st || null,
        prize2nd: prize2nd || null,
        prize3rd: prize3rd || null,
        prize4to10: prize4to10 || null,
        bannerUrl: bannerUrl || null,
        rules: rules || null,
        lobbyNotes: lobbyNotes || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      })
      .returning();

    publishTournamentToTelegramChannel(tournament).catch((err) => {
      logger.warn({ err, tournamentId: tournament.id }, "Failed to publish new tournament to Telegram channel");
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Create tournament error");
    const message = err instanceof Error ? err.message : "Failed to create tournament";
    const validationError = message.includes("ظرفیت مسابقه خصوصی کلش رویال");
    return NextResponse.json({ error: validationError ? message : "Failed to create tournament" }, { status: validationError ? 400 : 500 });
  }
}
