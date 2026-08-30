import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mediaPartners, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureAffiliateSchema, generateAffiliateCode, getMediaPartnerDashboard, normalizeIranSheba, redactSheba, affiliatePublicLink, affiliateProgramLive, affiliateRolloutMode } from "@/lib/affiliate-service";
import { isValidIranianNationalId } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const ApplicationSchema = z.object({
  legalName: z.string().trim().min(3).max(160),
  nationalId: z.string().regex(/^\d{10}$/).refine(isValidIranianNationalId, "کد ملی معتبر نیست"),
  sheba: z.string().trim(),
  mediaName: z.string().trim().min(2).max(160),
  mediaType: z.enum(["telegram_channel", "telegram_group", "instagram", "website", "youtube", "other"]),
  mediaUrl: z.string().url().max(500).refine((value) => /^https?:\/\//i.test(value), "آدرس رسانه باید امن و معتبر باشد"),
  followerCount: z.coerce.number().int().min(0).max(100_000_000),
  ownershipProofUrl: z.string().max(2_000_000).refine((value) => !value || /^https:\/\//i.test(value) || /^data:image\//i.test(value), "مدرک مالکیت معتبر نیست").optional().or(z.literal("")),
});

function publicDashboard(data: Awaited<ReturnType<typeof getMediaPartnerDashboard>>) {
  if (!data.partner) return { ...data, live: affiliateProgramLive(), rollout: affiliateRolloutMode() };
  return {
    ...data,
    partner: {
      ...data.partner,
      nationalId: data.partner.nationalId ? `${data.partner.nationalId.slice(0, 3)}••••${data.partner.nationalId.slice(-3)}` : null,
      sheba: redactSheba(data.partner.sheba),
      referralLink: affiliatePublicLink(data.partner.referralCode),
    },
    live: affiliateProgramLive(),
    rollout: affiliateRolloutMode(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    return NextResponse.json(publicDashboard(await getMediaPartnerDashboard(auth.user.id)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error({ error }, "Media partner dashboard GET failed");
    return NextResponse.json({ error: "اطلاعات همکاری رسانه‌ای دریافت نشد" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await ensureAffiliateSchema();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`media-partner-apply:${auth.user.id}:${ip}`, 5, 60 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است" }, { status: 429 });
    const parsed = ApplicationSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "اطلاعات نامعتبر" }, { status: 400 });
    const input = parsed.data;
    const sheba = normalizeIranSheba(input.sheba);
    if (!sheba) return NextResponse.json({ error: "شماره شبا باید با IR و ۲۴ رقم وارد شود" }, { status: 400 });
    const [user] = await db.select({ nationalId: users.nationalId, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users).where(eq(users.id, auth.user.id)).limit(1);
    if (!user?.email || !user.emailVerifiedAt) return NextResponse.json({ error: "برای قرارداد، ایمیل حساب باید تأیید شده باشد" }, { status: 403 });
    if (user.nationalId && user.nationalId !== input.nationalId) {
      return NextResponse.json({ error: "کد ملی فرم باید با کد ملی حساب Flexa یکسان باشد" }, { status: 409 });
    }
    const [existing] = await db.select().from(mediaPartners).where(eq(mediaPartners.userId, auth.user.id)).limit(1);
    if (existing?.partnerType === "personal") {
      return NextResponse.json({ error: "حساب شما در طرح معرفی کاربران فعال است. برای ارتقا به رسانه از پشتیبانی درخواست بدهید تا سابقه و انتساب‌ها حفظ شوند." }, { status: 409 });
    }
    if (existing && ["pending", "active", "suspended"].includes(existing.status)) {
      return NextResponse.json({ error: "درخواست فعال شما قابل ویرایش نیست" }, { status: 409 });
    }
    const values = {
      legalName: input.legalName,
      nationalId: input.nationalId,
      sheba,
      mediaName: input.mediaName,
      mediaType: input.mediaType,
      mediaUrl: input.mediaUrl,
      followerCount: input.followerCount,
      ownershipProofUrl: input.ownershipProofUrl || null,
      status: "draft",
      contractAcceptedAt: null,
      rejectionReason: null,
      updatedAt: new Date(),
    } as const;
    let partner;
    if (existing) {
      [partner] = await db.update(mediaPartners).set(values).where(and(eq(mediaPartners.id, existing.id), eq(mediaPartners.userId, auth.user.id))).returning();
    } else {
      for (let attempt = 0; attempt < 4 && !partner; attempt += 1) {
        try {
          [partner] = await db.insert(mediaPartners).values({ ...values, userId: auth.user.id, referralCode: generateAffiliateCode() }).returning();
        } catch (error: any) {
          if (error?.code !== "23505" || attempt === 3) throw error;
        }
      }
    }
    return NextResponse.json({ ok: true, partnerId: partner!.id, status: partner!.status }, { status: existing ? 200 : 201 });
  } catch (error) {
    logger.error({ error }, "Media partner application POST failed");
    return NextResponse.json({ error: "ثبت درخواست همکاری انجام نشد" }, { status: 500 });
  }
}
