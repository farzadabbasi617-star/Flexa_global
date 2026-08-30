import { NextRequest, NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { codRoomEntries, codRooms, codRoomStaff } from "@/db/schema";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { ensureCodArenaSchema } from "@/lib/cod-room-service";
import { evaluateCodRoomReadiness, codReadinessBlockers } from "@/lib/cod-room-readiness";
import { normalizeCodRewardConfig } from "@/lib/cod-room-policy";
import { publishCodRoomToTelegramChannel } from "@/lib/telegram";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Readiness report for the admin checklist. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await ensureCodArenaSchema();

  const [room] = await db.select().from(codRooms).where(eq(codRooms.id, id)).limit(1);
  if (!room) return NextResponse.json({ error: "روم پیدا نشد" }, { status: 404 });

  const [roomer] = await db.select({ id: codRoomStaff.id }).from(codRoomStaff)
    .where(and(eq(codRoomStaff.roomId, id), eq(codRoomStaff.role, "roomer"))).limit(1);

  let hasAnyReward = false;
  try {
    const reward = normalizeCodRewardConfig(room.rewardConfig);
    hasAnyReward = reward.placementRules.length > 0
      || BigInt(reward.perKillRial || "0") > BigInt(0)
      || BigInt(reward.participationRial || "0") > BigInt(0)
      || Boolean(reward.killLadder);
  } catch { hasAnyReward = false; }

  const issues = evaluateCodRoomReadiness({
    game: room.game,
    status: room.status,
    isPublished: room.isPublished,
    roomCode: room.roomCode,
    roomPassword: room.roomPassword,
    officialJoinUrl: room.officialJoinUrl,
    bannerImageUrl: room.bannerImageUrl,
    faq: room.faq,
    rules: room.rules,
    hasRoomer: Boolean(roomer),
    startsAt: room.startsAt,
    credentialsRevealAt: room.credentialsRevealAt,
    entryFeeRial: room.entryFeeRial,
    hasAnyReward,
  });

  return NextResponse.json({
    issues,
    publishable: codReadinessBlockers(issues).length === 0,
  }, { headers: { "Cache-Control": "no-store" } });
}

/** Announces the room in the Telegram channel. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await ensureCodArenaSchema();

    const [room] = await db.select().from(codRooms).where(eq(codRooms.id, id)).limit(1);
    if (!room) return NextResponse.json({ error: "روم پیدا نشد" }, { status: 404 });
    // Announcing a room nobody can open would send players to a dead end.
    if (!room.isPublished) {
      return NextResponse.json({ error: "روم منتشر نشده است؛ اول آن را منتشر کن" }, { status: 409 });
    }

    const [{ value: registered }] = await db.select({ value: count() })
      .from(codRoomEntries).where(eq(codRoomEntries.roomId, id));

    let topPrizeRial: string | null = null;
    try {
      const reward = normalizeCodRewardConfig(room.rewardConfig);
      topPrizeRial = reward.placementRules.find((rule) => rule.from === 1)?.amountRial ?? null;
    } catch { topPrizeRial = null; }

    const result = await publishCodRoomToTelegramChannel({
      id: room.id,
      title: room.title,
      map: room.map,
      teamMode: room.teamMode,
      capacity: room.capacity,
      registeredCount: Number(registered || 0),
      entryFeeRial: room.entryFeeRial,
      minCodLevel: room.minCodLevel,
      topPrizeRial,
      startsAt: room.startsAt,
      bannerUrl: room.bannerImageUrl,
    });

    if (!result.ok) {
      // Surface Telegram's own reason; it is almost always a bot/channel config
      // problem the operator can fix, not a bug.
      return NextResponse.json({ error: `ارسال به کانال تلگرام ناموفق بود: ${result.description || "دلیل نامشخص"}` }, { status: 502 });
    }

    await logAdminAction({
      adminId: auth.user.id,
      action: "announce",
      entityType: "cod_room",
      entityId: room.id,
      metadata: { title: room.title, registered: Number(registered || 0) },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error({ error, roomId: id }, "COD room announce failed");
    return NextResponse.json({ error: "ارسال اعلان انجام نشد" }, { status: 500 });
  }
}
