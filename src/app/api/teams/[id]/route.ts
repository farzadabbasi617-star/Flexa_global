import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications, teamMembers, teams, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function currentUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  return validateSession(token || "", ip, ua, request);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [team] = await db
      .select({
        id: teams.id,
        name: teams.name,
        tag: teams.tag,
        logoUrl: teams.logoUrl,
        ownerId: teams.ownerId,
        description: teams.description,
        createdAt: teams.createdAt,
        ownerName: users.displayName,
        ownerUsername: users.username,
      })
      .from(teams)
      .leftJoin(users, eq(teams.ownerId, users.id))
      .where(eq(teams.id, id))
      .limit(1);

    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const members = await db
      .select({
        id: teamMembers.id,
        role: teamMembers.role,
        joinedAt: teamMembers.joinedAt,
        userId: users.id,
        displayName: users.displayName,
        username: users.username,
        flexaId: users.flexaId,
        rankPoints: users.rankPoints,
        level: users.level,
        avatarUrl: users.avatarUrl,
      })
      .from(teamMembers)
      .leftJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, id))
      .orderBy(teamMembers.joinedAt);

    return NextResponse.json({ team, members });
  } catch {
    return NextResponse.json({ error: "Failed to fetch team" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const isAdmin = user.role === "admin" || user.role === "super_admin";
    if (!isAdmin && team.ownerId !== user.id) {
      return NextResponse.json({ error: "Only team owner can edit this team" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.tag !== undefined) updateData.tag = String(body.tag).trim().toUpperCase().slice(0, 10);
    if (body.description !== undefined) updateData.description = body.description ? String(body.description).trim() : null;
    if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl ? String(body.logoUrl).trim() : null;

    const [updated] = await db.update(teams).set(updateData).where(eq(teams.id, id)).returning();
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const isAdmin = user.role === "admin" || user.role === "super_admin";
    if (!isAdmin && team.ownerId !== user.id) {
      return NextResponse.json({ error: "Only team owner can delete this team" }, { status: 403 });
    }

    await db.transaction(async (tx) => {
      await tx.delete(teamMembers).where(eq(teamMembers.teamId, id));
      await tx.delete(teams).where(eq(teams.id, id));
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
