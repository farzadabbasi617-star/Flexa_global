import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { convertAffiliateBalanceToGamingWallet, requestAffiliatePayout } from "@/lib/affiliate-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    if (!new Set(["gaming_wallet", "cash"]).has(action)) return NextResponse.json({ error: "مقصد نامعتبر" }, { status: 400 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`personal-referral-redeem:${auth.user.id}:${ip}`, 4, 24 * 60 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است" }, { status: 429 });
    const result = action === "gaming_wallet"
      ? await convertAffiliateBalanceToGamingWallet(auth.user.id)
      : await requestAffiliatePayout(auth.user.id);
    if (!result.ok) {
      const errors: Record<string, string> = {
        shadow_mode: "طرح هنوز در حالت آزمایشی است و انتقال واقعی فعال نشده است",
        partner_not_active: "طرح معرفی یا قرارداد شما فعال نیست",
        no_available_balance: "موجودی آزادشده‌ای برای انتقال ندارید",
        sheba_required: "برای برداشت نقدی ابتدا شماره شبا ثبت کنید",
        identity_required: "برای برداشت نقدی باید کد ملی را در پروفایل ثبت کنی",
        payout_already_pending: "یک درخواست تسویه در حال بررسی دارید",
        below_minimum: "موجودی نقدی به حداقل ۲۰۰ هزار USDT نرسیده است",
      };
      return NextResponse.json({ error: errors[result.reason] || "عملیات مجاز نیست", details: result }, { status: 409 });
    }
    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error) {
    logger.error({ error }, "Personal referral redeem failed");
    return NextResponse.json({ error: "انتقال درآمد معرفی انجام نشد" }, { status: 500 });
  }
}
