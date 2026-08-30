import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { codPlayerRanks, users } from "@/db/schema";
import { COD_REGIONS } from "@/lib/cod-room-policy";
import { ensureCodArenaSchema } from "@/lib/cod-room-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await ensureCodArenaSchema();
    const requested = request.nextUrl.searchParams.get("region") || "global";
    const region = (COD_REGIONS as readonly string[]).includes(requested) ? requested : "global";
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 50), 1), 100);
    const ranks = await db.select({
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      codUsername: users.codMobileUsername,
      region: codPlayerRanks.region,
      points: codPlayerRanks.points,
      tier: codPlayerRanks.tier,
      verifiedRooms: codPlayerRanks.verifiedRooms,
      totalKills: codPlayerRanks.totalKills,
      wins: codPlayerRanks.wins,
    }).from(codPlayerRanks).innerJoin(users, eq(codPlayerRanks.userId, users.id))
      .where(and(eq(codPlayerRanks.region, region), isNotNull(users.codMobileUsername)))
      .orderBy(desc(codPlayerRanks.points), desc(codPlayerRanks.totalKills)).limit(limit);
    return NextResponse.json({ region, ranks });
  } catch (error) {
    logger.error({ error }, "COD ranks failed");
    return NextResponse.json({ error: "رتبه‌بندی COD Arena دریافت نشد" }, { status: 500 });
  }
}
