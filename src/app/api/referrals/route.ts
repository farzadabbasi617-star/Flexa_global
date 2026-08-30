import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { affiliateProgramLive, affiliateRolloutMode, affiliatePublicLink, createPersonalReferralAccount, getMediaPartnerDashboard, redactSheba, updatePersonalReferralSheba } from "@/lib/affiliate-service";
import { REFERRAL_QUICK_RULES, missingForCashWithdrawal, referralStage } from "@/lib/referral-onboarding";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function publicData(data: Awaited<ReturnType<typeof getMediaPartnerDashboard>>) {
  const base = {
    live: affiliateProgramLive(),
    rollout: affiliateRolloutMode(),
    quickRules: REFERRAL_QUICK_RULES,
  };
  if (!data.partner) {
    return { ...data, ...base, stage: "anonymous" as const, missingForCash: missingForCashWithdrawal({ hasPartner: false }) };
  }
  const facts = {
    hasPartner: true,
    quickRulesAcceptedAt: data.partner.quickRulesAcceptedAt,
    contractAcceptedAt: data.partner.contractAcceptedAt,
    nationalId: data.partner.nationalId,
    sheba: data.partner.sheba,
    status: data.partner.status,
  };
  const stage = referralStage(facts);
  return {
    ...data,
    ...base,
    stage,
    missingForCash: missingForCashWithdrawal(facts),
    partner: {
      ...data.partner,
      nationalId: data.partner.nationalId ? `${data.partner.nationalId.slice(0, 3)}••••${data.partner.nationalId.slice(-3)}` : null,
      sheba: redactSheba(data.partner.sheba),
      // The link exists as soon as stage 1 is done -- it no longer waits for
      // the legal contract.
      referralLink: stage === "anonymous" ? null : affiliatePublicLink(data.partner.referralCode),
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json(publicData(await getMediaPartnerDashboard(auth.user.id)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ error }, "Personal referral dashboard GET failed");
    return NextResponse.json({ error: "اطلاعات طرح معرفی دریافت نشد" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`personal-referral-start:${auth.user.id}:${ip}`, 4, 60 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است" }, { status: 429 });
    // Stage 1 needs nothing but a logged-in user who accepted the short rules.
    // The national id and verified email are checked at cash withdrawal, which
    // is where they are legally required -- demanding them to hand out a
    // tracking string is what kept this programme at 8 clicks.
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const rules = Array.isArray(body?.quickRules) ? body.quickRules : [];
    const acceptedAll = rules.length === REFERRAL_QUICK_RULES.length && rules.every((value: unknown) => value === true);
    if (!acceptedAll) return NextResponse.json({ error: "برای دریافت لینک، پذیرش هر سه قانون کوتاه الزامی است" }, { status: 400 });

    const [user] = await db.select({ displayName: users.displayName, firstName: users.firstName, lastName: users.lastName, nationalId: users.nationalId })
      .from(users).where(eq(users.id, auth.user.id)).limit(1);
    const legalName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.displayName || "کاربر Flexa";
    const result = await createPersonalReferralAccount({
      userId: auth.user.id,
      displayName: legalName,
      nationalId: user?.nationalId ?? null,
      quickRulesAccepted: true,
    });
    if (!result.created && result.reason === "media_partner_exists") {
      return NextResponse.json({ error: "حساب شما قبلاً به‌عنوان شریک رسانه‌ای ثبت شده و از همان لینک استفاده می‌کند", redirect: "/media-partners" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, status: result.partner?.status || "draft" }, { status: result.created ? 201 : 200 });
  } catch (error) {
    logger.error({ error }, "Personal referral activation POST failed");
    return NextResponse.json({ error: "شروع طرح معرفی انجام نشد" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json().catch(() => ({}));
    const result = await updatePersonalReferralSheba(auth.user.id, String(body.sheba || ""));
    if (!result.updated) return NextResponse.json({ error: result.reason === "invalid_sheba" ? "شماره شبای معتبر وارد کنید" : "حساب معرفی فعال نیست" }, { status: 400 });
    return NextResponse.json({ ok: true, sheba: redactSheba(result.partner.sheba) });
  } catch (error) {
    logger.error({ error }, "Personal referral sheba PATCH failed");
    return NextResponse.json({ error: "ثبت شماره شبا انجام نشد" }, { status: 500 });
  }
}
