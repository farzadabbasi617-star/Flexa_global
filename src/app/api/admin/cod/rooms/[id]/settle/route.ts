import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { settleCodRoom } from "@/lib/cod-room-service";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";
import logger from "@/lib/logger";
import { notifyLinkedUserOnTelegram } from "@/lib/telegram";
import { formatTomanFromRial, bigIntFromText } from "@/lib/money";

export const dynamic = "force-dynamic";

const schema = z.object({
  evidenceConfirmed: z.literal(true),
  lobbyOverrideConfirmed: z.boolean().optional().default(false),
  results: z.array(z.object({
    entryId: z.string().uuid(),
    kills: z.number().int().min(0).max(100),
    placement: z.number().int().min(1).max(100).nullable().optional(),
  })).max(100),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "روم پیدا نشد" }, { status: 404 });
  try {
    const auth = await requireAdminPermission(request, "tournaments");
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "نتایج معتبر نیست" }, { status: 400 });
    const result = await settleCodRoom({ roomId: id, adminId: auth.user.id, ...parsed.data });
    await logAdminAction({
      adminId: auth.user.id,
      action: parsed.data.lobbyOverrideConfirmed ? "settle_override" : "settle",
      entityType: "cod_room",
      entityId: id,
      metadata: {
        live: result.live,
        entryCount: result.entryCount,
        totalRewardRial: result.totalRewardRial,
        referralEventsCreated: result.referralEventsCreated,
        lobbyOverride: Boolean(parsed.data.lobbyOverrideConfirmed),
      },
      ipAddress: getClientIp(request.headers),
    });
    await Promise.all(result.participants.map((participant) => notifyLinkedUserOnTelegram(participant.userId, [
      "🏁 <b>نتیجه COD Arena تأیید شد</b>",
      "",
      `🎯 Kill: <b>${participant.kills}</b>`,
      `🏆 جایگاه: <b>${participant.placement || "—"}</b>`,
      `💰 جایزه: <b>${formatTomanFromRial(bigIntFromText(participant.rewardRial))}</b>`,
      result.live ? "✅ جایزه به کیف پول واریز شد." : "🧪 نتیجه و جایزه فعلاً فقط در Shadow Mode ثبت شده است.",
    ].join("\n"), { inline_keyboard: [[{ text: "مشاهده COD Arena", url: `${process.env.APP_URL || "https://www.flexa1.ir"}/cod-arena/${id}` }]] }).catch(() => undefined)));
    return NextResponse.json({ ok: true, settlement: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const known: Record<string, { text: string; status: number }> = {
      COD_ROOM_NOT_FOUND: { text: "روم پیدا نشد", status: 404 },
      COD_EVIDENCE_CONFIRMATION_REQUIRED: { text: "تأیید بررسی مدارک الزامی است", status: 400 },
      COD_SETTLEMENT_EVIDENCE_REQUIRED: { text: "قبل از تسویه باید Scoreboard یا رکورد Lobby ثبت شود", status: 409 },
      COD_SETTLEMENT_STATUS_INVALID: { text: "روم در وضعیت قابل تسویه نیست", status: 409 },
      COD_SETTLEMENT_EMPTY: { text: "بازیکنی برای تسویه وجود ندارد", status: 409 },
      COD_SETTLEMENT_ENTRY_INVALID: { text: "یکی از نتیجه‌ها متعلق به این روم نیست", status: 400 },
      COD_SETTLEMENT_DUPLICATE_PLACEMENT: { text: "در روم Solo جایگاه تکراری مجاز نیست", status: 400 },
      COD_LOBBY_FLAGGED_CONFIRMATION_REQUIRED: { text: "آخرین بررسی Lobby وضعیت مشکوک دارد؛ قبل از تسویه باید ادمین به‌صورت دستی override را تأیید کند", status: 409 },
      COD_SETTLEMENT_OVER_BUDGET: { text: "مجموع جایزه از بودجه قفل‌شده روم بیشتر است", status: 409 },
    };
    if (known[code]) return NextResponse.json({ error: known[code].text, code }, { status: known[code].status });
    logger.error({ error, roomId: id }, "COD room settlement failed");
    return NextResponse.json({ error: code === "UNKNOWN" ? "تسویه روم انجام نشد" : code }, { status: 500 });
  }
}
