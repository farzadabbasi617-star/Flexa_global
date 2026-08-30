import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { disputes, matches, players } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allDisputes = await db.select().from(disputes);
    return NextResponse.json(allDisputes);
  } catch {
    return NextResponse.json({ error: "Failed to fetch disputes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { matchId, raisedById, reason, evidenceUrls } = body;

    if (!matchId || !raisedById || !reason) {
      return NextResponse.json(
        { error: "Match ID, player ID, and reason are required" },
        { status: 400 }
      );
    }

    const isAdmin = user.role === "admin" || user.role === "super_admin";

    // The disputing player profile must exist and (unless admin) belong to the
    // current user. NOTE: raisedById is players.id; ownership is via
    // players.visibleUserId === user.id.
    const [player] = await db
      .select({ id: players.id, ownerId: players.visibleUserId })
      .from(players)
      .where(eq(players.id, raisedById));

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }
    if (!isAdmin && player.ownerId !== user.id) {
      return NextResponse.json(
        { error: "You can only raise a dispute for your own player profile" },
        { status: 403 }
      );
    }

    // The match must exist...
    const [match] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, matchId));
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    // ...and (unless admin) the player must actually be in it.
    if (!isAdmin && match.player1Id !== raisedById && match.player2Id !== raisedById) {
      return NextResponse.json(
        { error: "You can only dispute a match you played in" },
        { status: 403 }
      );
    }

    // Update match status to disputed
    await db
      .update(matches)
      .set({ status: "disputed" })
      .where(eq(matches.id, matchId));

    const [dispute] = await db
      .insert(disputes)
      .values({
        matchId,
        raisedById,
        reason,
        evidenceUrls: evidenceUrls || null,
      })
      .returning();

    return NextResponse.json(dispute, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Create dispute error");
    return NextResponse.json({ error: "Failed to create dispute" }, { status: 500 });
  }
}
