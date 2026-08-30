import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { notifications, teamMembers, teams, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function currentUser(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  return validateSession(token || "", ip, ua, request);
}

async function notifyOwner(teamId: string, actorName: string, action: string) {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return;
  await db.insert(notifications).values({
    userId: team.ownerId,
    type: "team",
    title: "رویداد تیم",
    message: `${actorName} ${action} تیم ${team.name}`,
    link: `/teams/${teamId}`,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "برای عضویت باید وارد حساب شوی." }, { status: 401 });

    const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const [existing] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, user.id)))
      .limit(1);

    if (existing) return NextResponse.json({ error: "قبلاً عضو این تیم هستی." }, { status: 409 });

    const [member] = await db
      .insert(teamMembers)
      .values({ teamId: id, userId: user.id, role: "member" })
      .returning();

    await notifyOwner(id, user.displayName, "به عضویت درآمد").catch(() => undefined);
    return NextResponse.json(member, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Join team failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const memberId = String(body.memberId || "");
    const role = String(body.role || "member");
    if (!memberId || !["member", "captain", "owner"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

    const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    const isAdmin = user.role === "admin" || user.role === "super_admin";
    if (!isAdmin && team.ownerId !== user.id) return NextResponse.json({ error: "Only owner can change roles" }, { status: 403 });

    const [updated] = await db
      .update(teamMembers)
      .set({ role })
      .where(and(eq(teamMembers.id, memberId), eq(teamMembers.teamId, id)))
      .returning();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Update member failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const memberId = body.memberId ? String(body.memberId) : "";
    const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

    const isAdmin = user.role === "admin" || user.role === "super_admin";

    if (memberId) {
      if (!isAdmin && team.ownerId !== user.id) return NextResponse.json({ error: "Only owner can remove members" }, { status: 403 });
      const [target] = await db.select().from(teamMembers).where(eq(teamMembers.id, memberId)).limit(1);
      if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
      if (target.userId === team.ownerId) return NextResponse.json({ error: "Owner cannot be removed" }, { status: 400 });
      await db.delete(teamMembers).where(eq(teamMembers.id, memberId));
      return NextResponse.json({ success: true });
    }

    const [ownMembership] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, user.id)))
      .limit(1);

    if (!ownMembership) return NextResponse.json({ error: "Not a member" }, { status: 404 });
    if (team.ownerId === user.id) return NextResponse.json({ error: "Owner cannot leave. Delete team or transfer ownership first." }, { status: 400 });

    await db.delete(teamMembers).where(eq(teamMembers.id, ownMembership.id));
    await notifyOwner(id, user.displayName, "از تیم خارج شد").catch(() => undefined);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Leave/remove member failed" }, { status: 500 });
  }
}
