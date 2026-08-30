import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getMediaPartnerDashboard, requestAffiliatePayout } from "@/lib/affiliate-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const data = await getMediaPartnerDashboard(auth.user.id);
  return NextResponse.json({ payouts: data.payouts, partnerStatus: data.partner?.status || null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`affiliate-payout:${auth.user.id}:${ip}`, 3, 24 * 60 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد درخواست برداشت زیاد است" }, { status: 429 });
    const result = await requestAffiliatePayout(auth.user.id);
    if (!result.ok) {
      const errors: Record<string, string> = {
        shadow_mode: "برنامه هنوز در حالت آزمایشی است و برداشت واقعی فعال نشده است",
        partner_not_active: "حساب رسانه فعال یا قرارداد معتبر نیست",
        payout_already_pending: "یک درخواست تسویه در حال بررسی دارید",
        below_minimum: "موجودی قابل برداشت به حداقل ۳۰۰ هزار USDT نرسیده است",
      };
      return NextResponse.json({ error: errors[result.reason] || "درخواست برداشت مجاز نیست", details: result }, { status: 409 });
    }
    return NextResponse.json({ ok: true, payout: result.payout }, { status: 201 });
  } catch (error) {
    logger.error({ error }, "Affiliate payout request failed");
    return NextResponse.json({ error: "درخواست تسویه ثبت نشد" }, { status: 500 });
  }
}
