import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { ClashRoyaleApiError, createClashRoyaleApiClient, normalizeClashRoyaleTag } from "@/lib/clash-royale-api";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "tournaments");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const tag = normalizeClashRoyaleTag(request.nextUrl.searchParams.get("tag"));
  if (!tag) return NextResponse.json({ error: "Tournament Tag معتبر نیست." }, { status: 400 });

  try {
    const tournament = await createClashRoyaleApiClient().getTournament(tag);
    return NextResponse.json({ supported: true, tournament }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ClashRoyaleApiError && error.status === 501) {
      return NextResponse.json({
        supported: false,
        manualLeaderboardRequired: true,
        error: "پراکسی RoyaleAPI فعلاً endpoint مسابقات خصوصی را پشتیبانی نمی‌کند؛ تصویر Leaderboard باید دستی ثبت شود.",
      }, { status: 501 });
    }
    logger.warn({ error, tournamentTag: tag }, "Clash tournament lookup failed");
    return NextResponse.json({ error: "استعلام مسابقه خصوصی انجام نشد." }, { status: 502 });
  }
}
