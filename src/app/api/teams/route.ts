import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allTeams = await db
      .select({
        id: teams.id,
        name: teams.name,
        tag: teams.tag,
        logoUrl: teams.logoUrl,
        ownerId: teams.ownerId,
        description: teams.description,
        createdAt: teams.createdAt,
        memberCount: count(teamMembers.id),
      })
      .from(teams)
      .leftJoin(teamMembers, eq(teamMembers.teamId, teams.id))
      .groupBy(teams.id)
      .orderBy(desc(teams.createdAt));

    return NextResponse.json(allTeams);
  } catch {
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const name = String(body.name || "").trim();
    const tag = String(body.tag || "").trim().toUpperCase();
    const description = body.description ? String(body.description).trim() : null;
    const logoUrl = body.logoUrl ? String(body.logoUrl).trim() : null;

    if (!name || !tag) {
      return NextResponse.json({ error: "Name and tag are required" }, { status: 400 });
    }
    if (tag.length > 10) return NextResponse.json({ error: "Team tag is too long" }, { status: 400 });

    const team = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(teams)
        .values({ name, tag, description, logoUrl, ownerId: user.id })
        .returning();

      await tx.insert(teamMembers).values({ teamId: created.id, userId: user.id, role: "owner" });
      return created;
    });

    return NextResponse.json(team, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
