import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { joinCodRoom } from "@/lib/cod-room-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { notifyLinkedUserOnTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const errors: Record<string, { text: string; status: number }> = {
  COD_RULES_REQUIRED: { text: "قبل از عضویت باید قوانین روم و ضبط مدرک را بپذیری", status: 400 },
  COD_ROOM_NOT_FOUND: { text: "روم کالاف پیدا نشد", status: 404 },
  COD_REGISTRATION_CLOSED: { text: "ثبت‌نام این روم بسته شده است", status: 409 },
  COD_USER_NOT_FOUND: { text: "حساب کاربری پیدا نشد", status: 404 },
  COD_PROFILE_REQUIRED: { text: "ابتدا UID و نام داخل بازی کالاف را در پروفایل ثبت کن", status: 409 },
  COD_PROFILE_NOT_VERIFIED: { text: "پروفایل کالاف هنوز توسط Flexa تأیید نشده است", status: 409 },
  COD_REGION_MISMATCH: { text: "ریجن پروفایل کالاف با ریجن این روم یکسان نیست", status: 409 },
  COD_ALREADY_JOINED: { text: "قبلاً عضو این روم شده‌ای", status: 409 },
  COD_UID_ALREADY_JOINED: { text: "این UID کالاف قبلاً برای همین روم ثبت شده و امکان ورود با دو حساب وجود ندارد", status: 409 },
  COD_ROOM_FULL: { text: "ظرفیت این روم تکمیل شده است", status: 409 },
  COD_RANK_TOO_LOW: { text: "رنک COD Arena شما برای این روم کافی نیست", status: 403 },
  COD_AGE_GATE_BLOCKED: { text: "برای روم پولی باید اطلاعات هویتی حساب کامل و معتبر باشد", status: 403 },
  COD_INSUFFICIENT_BALANCE: { text: "موجودی کیف پول برای ورود به این روم کافی نیست", status: 402 },
  COD_PAID_ROOM_NOT_LIVE: { text: "پرداخت روم‌های پولی موقتاً غیرفعال است؛ این روم تا فعال شدن پرداخت قابل ثبت‌نام نیست", status: 503 },
  COD_USER_TEMP_BANNED: { text: "حساب شما فعلاً از ورود به روم‌های COD Arena محروم است", status: 403 },
  COD_USER_PERMANENT_BANNED: { text: "حساب شما به‌صورت دائم از COD Arena محروم شده است", status: 403 },
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "روم پیدا نشد" }, { status: 404 });
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`cod:join:${auth.user.id}:${id}:${ip}`, 5, 60_000);
    if (!limited.success) return NextResponse.json({ error: "تعداد تلاش‌ها زیاد است؛ کمی صبر کن" }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    const result = await joinCodRoom({ roomId: id, userId: auth.user.id, rulesAccepted: body.rulesAccepted === true, ip });
    await notifyLinkedUserOnTelegram(auth.user.id, [
      "🎯 <b>عضویت COD Arena ثبت شد</b>",
      "",
      `🔥 ${result.roomTitle}`,
      result.live ? "💳 ورودی از کیف پول پرداخت شد." : "🧪 Private Beta: هیچ وجه واقعی کسر نشده است.",
      "",
      "زمان Check-in و آماده‌شدن Lobby از Flexa اطلاع‌رسانی می‌شود.",
    ].join("\n"), { inline_keyboard: [[{ text: "مشاهده روم", url: `${process.env.APP_URL || "https://www.flexa1.ir"}/cod-arena/${id}` }]] }).catch(() => undefined);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (errors[code]) return NextResponse.json({ error: errors[code].text, code }, { status: errors[code].status });
    logger.error({ error, roomId: id }, "COD room join failed");
    return NextResponse.json({ error: "عضویت در روم انجام نشد" }, { status: 500 });
  }
}
