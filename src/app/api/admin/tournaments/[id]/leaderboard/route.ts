import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  players,
  privateTournamentStandings,
  registrations,
  tournamentLeaderboardSubmissions,
  tournaments,
  transactions,
  users,
  wallets,
} from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import { CLASH_PRIVATE_DRAFT_CATEGORY } from "@/lib/clash-private-tournament";
import {
  ensureClashPrivateResultsSchema,
  parseClashPrivateLeaderboardImage,
  validateParsedLeaderboardRows,
} from "@/lib/clash-private-results";
import { normalizeClashRoyaleTag } from "@/lib/clash-royale-api";
import { calculateDynamicTournamentPrizePool } from "@/lib/tournament-finance";
import { notifyLinkedUserOnTelegram } from "@/lib/telegram";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

async function requireTournament(tournamentId: string) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) throw new Error("TOURNAMENT_NOT_FOUND");
  if (tournament.categoryLabel !== CLASH_PRIVATE_DRAFT_CATEGORY) throw new Error("NOT_PRIVATE_CLASH_TOURNAMENT");
  return tournament;
}

function imageRef(value: unknown) {
  const image = String(value || "").trim();
  if (/^https:\/\//i.test(image) && image.length <= 1000) return image;
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(image) && image.length <= 7_000_000) return image;
  return null;
}

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const known: Record<string, { text: string; status: number }> = {
    TOURNAMENT_NOT_FOUND: { text: "تورنومنت پیدا نشد.", status: 404 },
    NOT_PRIVATE_CLASH_TOURNAMENT: { text: "این قابلیت فقط برای مسابقه خصوصی Draft کلش رویال است.", status: 409 },
    LEADERBOARD_OCR_UNAVAILABLE: { text: "سرویس OCR تصویری در دسترس نیست؛ تصویر یا نتایج را دستی بررسی کن.", status: 503 },
    LEADERBOARD_OCR_NO_ROWS: { text: "هیچ ردیف معتبری از تصویر استخراج نشد.", status: 422 },
    LEADERBOARD_OCR_INVALID_JSON: { text: "خروجی OCR قابل پردازش نبود.", status: 502 },
  };
  return known[message] || { text: "پردازش Leaderboard انجام نشد.", status: 500 };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  try {
    await ensureClashPrivateResultsSchema();
    const tournament = await requireTournament(id);
    const [standings, submissions] = await Promise.all([
      db.select().from(privateTournamentStandings)
        .where(eq(privateTournamentStandings.tournamentId, id))
        .orderBy(asc(privateTournamentStandings.rank)),
      db.select({
        id: tournamentLeaderboardSubmissions.id,
        status: tournamentLeaderboardSubmissions.status,
        parsedData: tournamentLeaderboardSubmissions.parsedData,
        aiProvider: tournamentLeaderboardSubmissions.aiProvider,
        error: tournamentLeaderboardSubmissions.error,
        createdAt: tournamentLeaderboardSubmissions.createdAt,
      }).from(tournamentLeaderboardSubmissions)
        .where(eq(tournamentLeaderboardSubmissions.tournamentId, id))
        .orderBy(desc(tournamentLeaderboardSubmissions.createdAt))
        .limit(20),
    ]);
    return NextResponse.json({ tournament, standings, submissions });
  } catch (error) {
    const mapped = apiError(error);
    return NextResponse.json({ error: mapped.text }, { status: mapped.status });
  }
}

// Upload/parse a single leaderboard screenshot.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const limit = await rateLimit(`clash:leaderboard:ocr:${auth.user.id}:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.success) return NextResponse.json({ error: "سقف پردازش تصویر این ساعت پر شده است." }, { status: 429 });

  let submissionId: string | null = null;
  try {
    await ensureClashPrivateResultsSchema();
    const tournament = await requireTournament(id);
    const body = await request.json();
    const imageUrl = imageRef(body.imageUrl);
    if (!imageUrl) return NextResponse.json({ error: "تصویر Leaderboard معتبر نیست." }, { status: 400 });

    const [submission] = await db.insert(tournamentLeaderboardSubmissions).values({
      tournamentId: id,
      submittedById: auth.user.id,
      imageUrl,
      status: "pending",
    }).returning();
    submissionId = submission.id;

    const parsed = await parseClashPrivateLeaderboardImage(imageUrl, tournament.maxPlayers);
    await db.update(tournamentLeaderboardSubmissions).set({
      status: "parsed",
      parsedData: { rows: parsed.rows, model: parsed.model },
      aiProvider: parsed.provider,
      updatedAt: new Date(),
    }).where(eq(tournamentLeaderboardSubmissions.id, submission.id));

    return NextResponse.json({ submissionId: submission.id, ...parsed });
  } catch (error) {
    if (submissionId) {
      await db.update(tournamentLeaderboardSubmissions).set({
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN",
        updatedAt: new Date(),
      }).where(eq(tournamentLeaderboardSubmissions.id, submissionId)).catch(() => undefined);
    }
    logger.warn({ error, tournamentId: id }, "Private Clash leaderboard OCR failed");
    const mapped = apiError(error);
    return NextResponse.json({ error: mapped.text, submissionId }, { status: mapped.status });
  }
}

// Confirm editable OCR rows and map them to registered Flexa accounts.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  try {
    await ensureClashPrivateResultsSchema();
    const tournament = await requireTournament(id);
    const body = await request.json();
    const submissionId = String(body.submissionId || "");
    const rows = validateParsedLeaderboardRows({ rows: body.rows }, tournament.maxPlayers);
    if (!submissionId || !rows.length) return NextResponse.json({ error: "ردیف معتبر برای ثبت وجود ندارد." }, { status: 400 });

    const [submission] = await db.select().from(tournamentLeaderboardSubmissions)
      .where(and(eq(tournamentLeaderboardSubmissions.id, submissionId), eq(tournamentLeaderboardSubmissions.tournamentId, id)))
      .limit(1);
    if (!submission) return NextResponse.json({ error: "ارسال تصویر پیدا نشد." }, { status: 404 });

    const registered = await db
      .select({
        playerId: registrations.playerId,
        userId: registrations.visibleUserId,
        playerName: players.displayName,
        clashName: users.clashRoyaleUsername,
        clashTag: users.clashRoyaleId,
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .leftJoin(users, eq(registrations.visibleUserId, users.id))
      .where(eq(registrations.tournamentId, id));

    const normalizedName = (value?: string | null) => String(value || "").trim().toLocaleLowerCase("fa-IR");
    const confirmed = rows.map((row) => {
      const byTag = row.playerTag
        ? registered.find((player) => normalizeClashRoyaleTag(player.clashTag) === row.playerTag)
        : undefined;
      const byName = registered.find((player) =>
        [player.clashName, player.playerName].some((name) => normalizedName(name) === normalizedName(row.playerName))
      );
      const player = byTag || byName;
      return { ...row, player };
    });

    await db.transaction(async (tx) => {
      for (const row of confirmed) {
        await tx.insert(privateTournamentStandings).values({
          tournamentId: id,
          submissionId,
          rank: row.rank,
          playerId: row.player?.playerId || null,
          userId: row.player?.userId || null,
          playerTag: row.playerTag || normalizeClashRoyaleTag(row.player?.clashTag) || null,
          playerName: row.playerName,
          score: row.score,
          verified: Boolean(row.player),
          source: "leaderboard_ocr",
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [privateTournamentStandings.tournamentId, privateTournamentStandings.rank],
          set: {
            submissionId,
            playerId: row.player?.playerId || null,
            userId: row.player?.userId || null,
            playerTag: row.playerTag || normalizeClashRoyaleTag(row.player?.clashTag) || null,
            playerName: row.playerName,
            score: row.score,
            verified: Boolean(row.player),
            updatedAt: new Date(),
          },
        });
      }
      await tx.update(tournamentLeaderboardSubmissions).set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(tournamentLeaderboardSubmissions.id, submissionId));
    });

    return NextResponse.json({
      success: true,
      rows: confirmed.map((row) => ({ ...row, player: row.player ? { playerId: row.player.playerId, userId: row.player.userId } : null })),
      matched: confirmed.filter((row) => row.player).length,
      unmatched: confirmed.filter((row) => !row.player).length,
    });
  } catch (error) {
    logger.error({ error, tournamentId: id }, "Confirm private Clash standings failed");
    const mapped = apiError(error);
    return NextResponse.json({ error: mapped.text }, { status: mapped.status });
  }
}

// Finalize standings and distribute the configured dynamic prize ladder once.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  try {
    await ensureClashPrivateResultsSchema();
    const tournament = await requireTournament(id);
    const standings = await db.select().from(privateTournamentStandings)
      .where(eq(privateTournamentStandings.tournamentId, id))
      .orderBy(asc(privateTournamentStandings.rank));
    const winnersCount = Math.min(10, Math.max(1, tournament.winnersCount || 3));
    const prizeRows = standings.filter((row) => row.rank <= winnersCount);
    if (prizeRows.length < winnersCount || prizeRows.some((row) => !row.verified || !row.userId)) {
      return NextResponse.json({ error: `ابتدا رتبه‌های ۱ تا ${winnersCount} را به کاربران تأییدشده متصل کن.` }, { status: 409 });
    }

    const [{ value: registeredCount }] = await db.select({ value: sql<number>`count(*)` })
      .from(registrations).where(eq(registrations.tournamentId, id));
    // Pooled ladder is correct here: this route is gated to
    // CLASH_PRIVATE_DRAFT_CATEGORY above, so it never handles the 1V1 queue
    // (which is a two-player, winner-takes-all duel — see `isDuel`).
    const finance = calculateDynamicTournamentPrizePool({
      entryFee: tournament.entryFee,
      registeredCount: Number(registeredCount || 0),
      maxPlayers: tournament.maxPlayers,
      staticPrizePool: tournament.prizePool,
    });
    if (finance.netPrizePoolToman <= 0) return NextResponse.json({ error: "استخر جایزه قابل پرداخت نیست." }, { status: 409 });

    const payments = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM tournaments WHERE id = ${id} FOR UPDATE`);
      const paid: Array<{ rank: number; userId: string; amountToman: number }> = [];
      for (const standing of prizeRows) {
        const ladder = finance.ladder[standing.rank - 1];
        if (!ladder || ladder.amountToman <= 0 || !standing.userId) continue;
        const referenceId = `private-prize-${id}-rank-${standing.rank}`;
        const [existing] = await tx.select({ id: transactions.id }).from(transactions)
          .where(eq(transactions.referenceId, referenceId)).limit(1);
        if (existing) continue;

        let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, standing.userId)).limit(1);
        if (!wallet) {
          [wallet] = await tx.insert(wallets).values({ userId: standing.userId, balance: "0", currency: "RIAL" }).returning();
        }
        const amountRial = (BigInt(ladder.amountToman) * BigInt(10)).toString();
        await tx.update(wallets).set({ balance: sql`${wallets.balance} + ${amountRial}`, updatedAt: new Date() })
          .where(eq(wallets.id, wallet.id));
        await tx.insert(transactions).values({
          walletId: wallet.id,
          amount: amountRial,
          type: "tournament_win",
          status: "completed",
          referenceId,
          metadata: {
            kind: "private_clash_tournament_prize",
            tournamentId: id,
            rank: standing.rank,
            percentageText: ladder.percentageText,
            adminId: auth.user.id,
          },
        });
        paid.push({ rank: standing.rank, userId: standing.userId, amountToman: ladder.amountToman });
      }
      await tx.update(tournaments).set({ status: "completed", updatedAt: new Date() }).where(eq(tournaments.id, id));
      return paid;
    });

    await Promise.allSettled(payments.map((payment) => notifyLinkedUserOnTelegram(
      payment.userId,
      `🏆 <b>جایزه مسابقه خصوصی کلش رویال</b>\n\nرتبه شما: <b>${payment.rank.toLocaleString("fa-IR")}</b>\nمبلغ واریزی: <b>${payment.amountToman.toLocaleString("fa-IR")} USDT</b>`,
      { inline_keyboard: [[{ text: "💳 مشاهده کیف پول", url: `${process.env.APP_URL || "https://www.flexa1.ir"}/wallet` }]] },
    )));
    await logAdminAction({
      adminId: auth.user.id,
      action: "finalize_private_clash_leaderboard",
      entityType: "tournament",
      entityId: id,
      metadata: { payments: payments.length, winnersCount },
      ipAddress: getClientIp(request.headers),
    });
    return NextResponse.json({ success: true, payments, finance });
  } catch (error) {
    logger.error({ error, tournamentId: id }, "Finalize private Clash leaderboard failed");
    const mapped = apiError(error);
    return NextResponse.json({ error: mapped.text }, { status: mapped.status });
  }
}
