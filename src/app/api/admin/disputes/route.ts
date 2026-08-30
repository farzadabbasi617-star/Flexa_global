import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { disputes, judges, matches, players, tournaments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "disputes");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const rows = await db
      .select({
        id: disputes.id,
        matchId: disputes.matchId,
        raisedById: disputes.raisedById,
        playerName: players.displayName,
        reason: disputes.reason,
        evidenceUrls: disputes.evidenceUrls,
        status: disputes.status,
        resolution: disputes.resolution,
        resolvedById: disputes.resolvedById,
        resolvedByName: judges.name,
        createdAt: disputes.createdAt,
        resolvedAt: disputes.resolvedAt,
        tournamentName: tournaments.name,
      })
      .from(disputes)
      .leftJoin(players, eq(disputes.raisedById, players.id))
      .leftJoin(matches, eq(disputes.matchId, matches.id))
      .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
      .leftJoin(judges, eq(disputes.resolvedById, judges.id))
      .orderBy(desc(disputes.createdAt))
      .limit(300);

    return NextResponse.json(rows);
  } catch (err) {
    logger.error({ err }, "Admin disputes GET failed");
    return NextResponse.json({ error: "Failed to load disputes" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "disputes");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const [updated] = await db
      .update(disputes)
      .set({
        status: body.status ? String(body.status) : "resolved",
        resolution: body.resolution ? String(body.resolution) : null,
        resolvedAt: new Date(),
      })
      .where(eq(disputes.id, id))
      .returning();

    if (body.status === "resolved" || !body.status) {
      await db.update(matches).set({ status: "awaiting_judgment" }).where(eq(matches.id, updated.matchId));
    }

    await logAdminAction({
      adminId: auth.user.id,
      action: "resolve",
      entityType: "dispute",
      entityId: id,
      metadata: { status: updated.status, resolution: updated.resolution },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json(updated);
  } catch (err) {
    logger.error({ err }, "Admin disputes PATCH failed");
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminPermission(request, "disputes");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(disputes).where(eq(disputes.id, id));
    await logAdminAction({ adminId: auth.user.id, action: "delete", entityType: "dispute", entityId: String(id), ipAddress: getClientIp(request.headers) });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Admin disputes DELETE failed");
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
