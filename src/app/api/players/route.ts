import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, users } from "@/db/schema";
import { desc, count, eq, sql } from "drizzle-orm";
import { requireRole, validateSession } from "@/lib/auth";
import { safePagination } from "@/lib/pagination";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { page, limit, offset } = safePagination({
    page: searchParams.get("page"),
    limit: searchParams.get("limit"),
    defaultLimit: 20,
    maxLimit: 100,
  });

  try {
    const token = request.cookies.get("session")?.value || "";
    const currentUser = token
      ? await validateSession(
          token,
          request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown",
          request.headers.get("user-agent") || "unknown",
          request
        )
      : null;
    const [totalResult] = await db
      .select({ value: count() })
      .from(players);

    const rows = await db
      .select({
        id: players.id,
        ownerId: players.visibleUserId,
        username: players.username,
        displayName: players.displayName,
        // Fetch users.avatarUrl instead of players.avatarUrl to keep active profile avatars synced instantly.
        avatarUrl: users.avatarUrl,
        rating: players.rating,
        wins: players.wins,
        losses: players.losses,
        createdAt: players.createdAt,
        flexaId: users.flexaId,
        xp: users.xp,
        level: users.level,
        rankPoints: users.rankPoints,
        isVerified: users.isVerified,
        hasClashRoyale: sql<boolean>`${users.clashRoyaleId} IS NOT NULL`,
        hasCodMobile: sql<boolean>`${users.codMobileId} IS NOT NULL`,
        hasFortnite: sql<boolean>`${users.fortniteId} IS NOT NULL`,
        clashRoyaleUsername: users.clashRoyaleUsername,
        codMobileUsername: users.codMobileUsername,
        fortniteUsername: users.fortniteUsername,
      })
      .from(players)
      .leftJoin(users, eq(players.visibleUserId, users.id))
      .orderBy(desc(players.rating))
      .limit(limit)
      .offset(offset);

    // Staff roles are deliberately not selected above. Hiding the badge in the
    // UI alone would still ship "role":"super_admin" in this public JSON, which
    // hands anyone a list of which accounts to target.
    const publicPlayers = rows.map(({ ownerId, ...player }) => ({
      ...player,
      isOwner: Boolean(currentUser && ownerId === currentUser.id),
    }));

    return NextResponse.json({
      data: publicPlayers,
      pagination: {
        total: totalResult.value,
        page,
        limit,
        totalPages: Math.ceil(totalResult.value / limit),
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch players" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Creating player profiles directly is an admin action (normal players get
  // a profile automatically at registration).
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const body = await request.json();
    const { username, displayName, email, gameId } = body;

    if (!username || !displayName) {
      return NextResponse.json(
        { error: "Username and display name are required" },
        { status: 400 }
      );
    }

    const [player] = await db
      .insert(players)
      .values({
        username,
        displayName,
        email: email || null,
        gameId: gameId || null,
      })
      .returning();

    return NextResponse.json(player, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create player" }, { status: 500 });
  }
}
