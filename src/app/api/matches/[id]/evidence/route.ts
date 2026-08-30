import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matchEvidence, matches, players, users } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const token = request.cookies.get("session")?.value;
    const user = await validateSession(token || "", getClientIp(request), request.headers.get("user-agent") || "unknown", request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [match] = await db.select().from(matches).where(eq(matches.id, id)).limit(1);
    if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

    const isPrivileged = ["admin", "super_admin", "judge", "moderator"].includes(user.role);
    if (!isPrivileged) {
      const playerIds = [match.player1Id, match.player2Id].filter(Boolean) as string[];
      if (playerIds.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const participants = await db
        .select({ ownerId: players.visibleUserId })
        .from(players)
        .where(inArray(players.id, playerIds));
      if (!participants.some((p) => p.ownerId === user.id)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const evidence = await db
      .select({
        id: matchEvidence.id,
        matchId: matchEvidence.matchId,
        uploadedById: matchEvidence.uploadedById,
        uploaderName: users.displayName,
        uploaderUsername: users.username,
        uploaderRole: users.role,
        fileUrl: matchEvidence.fileUrl,
        fileType: matchEvidence.fileType,
        description: matchEvidence.description,
        createdAt: matchEvidence.createdAt,
      })
      .from(matchEvidence)
      .leftJoin(users, eq(matchEvidence.uploadedById, users.id))
      .where(eq(matchEvidence.matchId, id))
      .orderBy(desc(matchEvidence.createdAt));

    return NextResponse.json(evidence);
  } catch (err) {
    logger.error({ err, matchId: id }, "Fetch match evidence failed");
    return NextResponse.json({ error: "Failed to load evidence" }, { status: 500 });
  }
}
