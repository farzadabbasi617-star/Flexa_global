import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  disputes,
  judgments,
  matchEvidence,
  matches,
  players,
  registrations,
  siteImages,
  telegramPreRegistrations,
  tournaments,
  users,
} from "@/db/schema";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdminPermission } from "@/lib/admin-permissions";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function isAdminError(result: { user: unknown; error: string | null | undefined }) {
  return result.error || !result.user;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "overview");
    if (isAdminError(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 80), 250);

    const [uCount] = await db.select({ v: count() }).from(users);
    const [tCount] = await db.select({ v: count() }).from(tournaments);
    const [mCount] = await db.select({ v: count() }).from(matches);
    const [completedCount] = await db.select({ v: count() }).from(matches).where(eq(matches.status, "completed"));
    const [dCount] = await db.select({ v: count() }).from(disputes);
    const [jCount] = await db.select({ v: count() }).from(judgments);
    const [aiCount] = await db.select({ v: count() }).from(judgments).where(eq(judgments.isAiJudgment, true));
    const [imgCount] = await db.select({ v: count() }).from(siteImages);
    const [telegramPreRegCount] = await db.select({ v: count() }).from(telegramPreRegistrations);
    const [telegramNewCount] = await db
      .select({ v: count() })
      .from(telegramPreRegistrations)
      .where(eq(telegramPreRegistrations.status, "new"));
    const [codPendingProfileCount] = await db
      .select({ v: count() })
      .from(users)
      .where(and(
        eq(users.codMobileStatus, "pending"),
        isNotNull(users.codMobileId),
        isNotNull(users.codMobileUsername),
      ));

    const userRows = await db
      .select({
        id: users.id,
        phoneNumber: users.phoneNumber,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        flexaId: users.flexaId,
        role: users.role,
        isVerified: users.isVerified,
        level: users.level,
        rankPoints: users.rankPoints,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit);

    const tournamentRows = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        game: tournaments.game,
        format: tournaments.format,
        status: tournaments.status,
        maxPlayers: tournaments.maxPlayers,
        prizePool: tournaments.prizePool,
        entryFee: tournaments.entryFee,
        startDate: tournaments.startDate,
        createdAt: tournaments.createdAt,
        registrations: count(registrations.id),
      })
      .from(tournaments)
      .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
      .groupBy(tournaments.id)
      .orderBy(desc(tournaments.createdAt))
      .limit(limit);

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
        status: matches.status,
        player1Score: matches.player1Score,
        player2Score: matches.player2Score,
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
      .limit(limit);

    const judgmentRows = await db
      .select({
        id: judgments.id,
        matchId: judgments.matchId,
        verdict: judgments.verdict,
        isAiJudgment: judgments.isAiJudgment,
        confidence: judgments.confidence,
        reasoning: judgments.reasoning,
        createdAt: judgments.createdAt,
        tournamentName: tournaments.name,
      })
      .from(judgments)
      .leftJoin(matches, eq(judgments.matchId, matches.id))
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .orderBy(desc(judgments.createdAt))
      .limit(limit);

    const disputeRows = await db
      .select({
        id: disputes.id,
        matchId: disputes.matchId,
        reason: disputes.reason,
        status: disputes.status,
        resolution: disputes.resolution,
        createdAt: disputes.createdAt,
        resolvedAt: disputes.resolvedAt,
        playerName: players.displayName,
        tournamentName: tournaments.name,
      })
      .from(disputes)
      .leftJoin(players, eq(disputes.raisedById, players.id))
      .leftJoin(matches, eq(disputes.matchId, matches.id))
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .orderBy(desc(disputes.createdAt))
      .limit(limit);

    const imageRows = await db
      .select({
        id: siteImages.id,
        slug: siteImages.slug,
        title: siteImages.title,
        url: siteImages.url,
        category: siteImages.category,
        sortOrder: siteImages.sortOrder,
        isActive: siteImages.isActive,
      })
      .from(siteImages)
      .orderBy(desc(siteImages.createdAt))
      .limit(limit);

    const telegramRows = await db
      .select({
        id: telegramPreRegistrations.id,
        telegramId: telegramPreRegistrations.telegramId,
        telegramUsername: telegramPreRegistrations.telegramUsername,
        fullName: telegramPreRegistrations.fullName,
        phoneNumber: telegramPreRegistrations.phoneNumber,
        flexaId: telegramPreRegistrations.flexaId,
        linkedUserId: telegramPreRegistrations.linkedUserId,
        linkedDisplayName: users.displayName,
        game: telegramPreRegistrations.game,
        platform: telegramPreRegistrations.platform,
        gamerTag: telegramPreRegistrations.gamerTag,
        city: telegramPreRegistrations.city,
        teamName: telegramPreRegistrations.teamName,
        status: telegramPreRegistrations.status,
        source: telegramPreRegistrations.source,
        createdAt: telegramPreRegistrations.createdAt,
        updatedAt: telegramPreRegistrations.updatedAt,
      })
      .from(telegramPreRegistrations)
      .leftJoin(users, eq(telegramPreRegistrations.linkedUserId, users.id))
      .orderBy(desc(telegramPreRegistrations.updatedAt))
      .limit(limit);

    return NextResponse.json({
      stats: {
        users: uCount.v,
        tournaments: tCount.v,
        matches: mCount.v,
        completedMatches: completedCount.v,
        disputes: dCount.v,
        messages: 0,
        judgments: jCount.v,
        aiJudgments: aiCount.v,
        images: imgCount.v,
        telegramPreRegistrations: telegramPreRegCount.v,
        telegramNewPreRegistrations: telegramNewCount.v,
        codPendingProfiles: codPendingProfileCount.v,
      },
      users: userRows,
      tournaments: tournamentRows,
      matches: matchRows,
      judgments: judgmentRows,
      disputes: disputeRows,
      messages: [],
      images: imageRows,
      telegramPreRegistrations: telegramRows,
    });
  } catch (err) {
    logger.error({ err }, "Admin console GET failed");
    return NextResponse.json({ error: "Failed to load admin console" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "overview");
    if (isAdminError(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { resource, id } = await request.json();
    if (!resource || !id) return NextResponse.json({ error: "resource and id required" }, { status: 400 });

    if (resource === "telegram_pre_registration") {
      await db.delete(telegramPreRegistrations).where(eq(telegramPreRegistrations.id, id));
    } else if (resource === "judgment") {
      await db.delete(judgments).where(eq(judgments.id, id));
    } else if (resource === "dispute") {
      await db.delete(disputes).where(eq(disputes.id, id));
    } else if (resource === "match") {
      await db.transaction(async (tx) => {
        await tx.delete(judgments).where(eq(judgments.matchId, id));
        await tx.delete(disputes).where(eq(disputes.matchId, id));
        await tx.delete(matchEvidence).where(eq(matchEvidence.matchId, id));
        await tx.delete(matches).where(eq(matches.id, id));
      });
    } else if (resource === "tournament") {
      await db.transaction(async (tx) => {
        const relatedMatches = await tx.select({ id: matches.id }).from(matches).where(eq(matches.tournamentId, id));
        const matchIds = relatedMatches.map((m) => m.id);
        if (matchIds.length > 0) {
          await tx.delete(judgments).where(inArray(judgments.matchId, matchIds));
          await tx.delete(disputes).where(inArray(disputes.matchId, matchIds));
          await tx.delete(matchEvidence).where(inArray(matchEvidence.matchId, matchIds));
        }
        await tx.delete(registrations).where(eq(registrations.tournamentId, id));
        await tx.delete(matches).where(eq(matches.tournamentId, id));
        await tx.delete(tournaments).where(eq(tournaments.id, id));
      });
    } else {
      return NextResponse.json({ error: "Unsupported resource" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin console DELETE failed");
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "overview");
    if (isAdminError(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { resource, id, data } = await request.json();
    if (!resource || !id || !data) return NextResponse.json({ error: "resource, id and data required" }, { status: 400 });

    if (resource === "telegram_pre_registration") {
      const allowed = ["new", "contacted", "converted", "archived"];
      if (data.status && !allowed.includes(data.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      const [updated] = await db
        .update(telegramPreRegistrations)
        .set({ status: data.status || "contacted", updatedAt: new Date() })
        .where(eq(telegramPreRegistrations.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (resource === "tournament") {
      const allowed = ["registration", "in_progress", "completed", "cancelled"];
      if (data.status && !allowed.includes(data.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      const [updated] = await db
        .update(tournaments)
        .set({ status: data.status, updatedAt: new Date() })
        .where(eq(tournaments.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (resource === "match") {
      const allowed = ["pending", "in_progress", "awaiting_judgment", "completed", "disputed"];
      if (data.status && !allowed.includes(data.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      const [updated] = await db
        .update(matches)
        .set({ status: data.status })
        .where(eq(matches.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (resource === "dispute") {
      const [updated] = await db
        .update(disputes)
        .set({
          status: data.status || "resolved",
          resolution: data.resolution || null,
          resolvedAt: new Date(),
        })
        .where(eq(disputes.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Unsupported resource" }, { status: 400 });
  } catch (err) {
    logger.error({ err }, "Admin console PATCH failed");
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
