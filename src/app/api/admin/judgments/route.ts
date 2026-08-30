import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { judges, judgments, matches, tournaments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "judgments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const rows = await db
      .select({
        id: judgments.id,
        matchId: judgments.matchId,
        judgeId: judgments.judgeId,
        judgeName: judges.name,
        isAiJudgment: judgments.isAiJudgment,
        verdict: judgments.verdict,
        reasoning: judgments.reasoning,
        confidence: judgments.confidence,
        scoreBreakdown: judgments.scoreBreakdown,
        createdAt: judgments.createdAt,
        tournamentName: tournaments.name,
      })
      .from(judgments)
      .leftJoin(judges, eq(judgments.judgeId, judges.id))
      .leftJoin(matches, eq(judgments.matchId, matches.id))
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .orderBy(desc(judgments.createdAt))
      .limit(300);

    const matchRows = await db
      .select({ id: matches.id, tournamentName: tournaments.name, round: matches.round, matchNumber: matches.matchNumber, status: matches.status })
      .from(matches)
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .orderBy(desc(matches.createdAt))
      .limit(500);

    const judgeRows = await db.select().from(judges).orderBy(desc(judges.createdAt)).limit(200);

    return NextResponse.json({ judgments: rows, matches: matchRows, judges: judgeRows });
  } catch (err) {
    logger.error({ err }, "Admin judgments GET failed");
    return NextResponse.json({ error: "Failed to load judgments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "judgments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const matchId = String(body.matchId || "");
    const verdict = String(body.verdict || "");
    if (!matchId || !verdict) return NextResponse.json({ error: "matchId and verdict required" }, { status: 400 });

    const [created] = await db
      .insert(judgments)
      .values({
        matchId,
        judgeId: body.judgeId || null,
        isAiJudgment: Boolean(body.isAiJudgment),
        verdict,
        reasoning: body.reasoning ? String(body.reasoning) : null,
        confidence: body.confidence === "" || body.confidence === undefined ? null : Number(body.confidence),
        scoreBreakdown: body.scoreBreakdown || null,
      })
      .returning();

    await logAdminAction({
      adminId: auth.user.id,
      action: "create",
      entityType: "judgment",
      entityId: created.id,
      metadata: { matchId, verdict, isAiJudgment: created.isAiJudgment },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Admin judgments POST failed");
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "judgments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(judgments).where(eq(judgments.id, id));
    await logAdminAction({ adminId: auth.user.id, action: "delete", entityType: "judgment", entityId: String(id), ipAddress: getClientIp(request.headers) });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin judgments DELETE failed");
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
