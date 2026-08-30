import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { createClashRoyaleApiClient, normalizeClashRoyaleTag, ClashRoyaleApiError } from "@/lib/clash-royale-api";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("session")?.value || "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const user = await validateSession(token, ip, request.headers.get("user-agent") || "unknown", request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = await rateLimit(`clash:player:${user.id}:${ip}`, 20, 60_000);
  if (!limit.success) return NextResponse.json({ error: "درخواست‌ها زیاد است؛ کمی صبر کن." }, { status: 429 });

  const tag = normalizeClashRoyaleTag(request.nextUrl.searchParams.get("tag"));
  if (!tag) return NextResponse.json({ error: "Player Tag معتبر نیست." }, { status: 400 });

  try {
    const player = await createClashRoyaleApiClient().getPlayer(tag);
    return NextResponse.json({
      player: {
        tag: normalizeClashRoyaleTag(player.tag) || tag,
        name: player.name,
        expLevel: player.expLevel ?? null,
        trophies: player.trophies ?? null,
        bestTrophies: player.bestTrophies ?? null,
        wins: player.wins ?? null,
        losses: player.losses ?? null,
        battleCount: player.battleCount ?? null,
        clan: player.clan ? { tag: player.clan.tag || null, name: player.clan.name || null } : null,
        arena: player.arena ? { id: player.arena.id || null, name: player.arena.name || null } : null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ClashRoyaleApiError) {
      if (error.status === 404) return NextResponse.json({ error: "بازیکن در Clash Royale پیدا نشد." }, { status: 404 });
      if (error.status === 403) return NextResponse.json({ error: "کلید Clash Royale یا IP مجاز نیست." }, { status: 502 });
      if (error.status === 503) return NextResponse.json({ error: "Clash Royale API تنظیم نشده است." }, { status: 503 });
    }
    logger.warn({ error, userId: user.id }, "Clash player lookup failed");
    return NextResponse.json({ error: "ارتباط با Clash Royale API انجام نشد." }, { status: 502 });
  }
}
