import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaPartnerAgreements, mediaPartners, notifications, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureAffiliateSchema } from "@/lib/affiliate-service";
import { EmailService, InvalidOtpError } from "@/lib/email-service";
import {
  PERSONAL_REFERRAL_CONFIRMATIONS,
  PERSONAL_REFERRAL_CONTRACT_HASH,
  PERSONAL_REFERRAL_CONTRACT_TEXT,
  PERSONAL_REFERRAL_CONTRACT_TITLE,
  PERSONAL_REFERRAL_CONTRACT_VERSION,
} from "@/lib/personal-referral-contract";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await ensureAffiliateSchema();
  const [partner] = await db.select({ id: mediaPartners.id, partnerType: mediaPartners.partnerType, status: mediaPartners.status, legalName: mediaPartners.legalName, contractAcceptedAt: mediaPartners.contractAcceptedAt })
    .from(mediaPartners).where(eq(mediaPartners.userId, auth.user.id)).limit(1);
  const [agreement] = partner?.partnerType === "personal" ? await db.select({ acceptedAt: mediaPartnerAgreements.acceptedAt, contentHash: mediaPartnerAgreements.contentHash })
    .from(mediaPartnerAgreements).where(and(
      eq(mediaPartnerAgreements.partnerId, partner.id),
      eq(mediaPartnerAgreements.contractVersion, PERSONAL_REFERRAL_CONTRACT_VERSION),
      eq(mediaPartnerAgreements.contentHash, PERSONAL_REFERRAL_CONTRACT_HASH),
    )).orderBy(desc(mediaPartnerAgreements.acceptedAt)).limit(1) : [];
  return NextResponse.json({
    title: PERSONAL_REFERRAL_CONTRACT_TITLE,
    version: PERSONAL_REFERRAL_CONTRACT_VERSION,
    contentHash: PERSONAL_REFERRAL_CONTRACT_HASH,
    content: PERSONAL_REFERRAL_CONTRACT_TEXT,
    confirmations: PERSONAL_REFERRAL_CONFIRMATIONS,
    partner: partner || null,
    agreement: partner?.contractAcceptedAt ? agreement || null : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    await ensureAffiliateSchema();
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const [partner] = await db.select().from(mediaPartners).where(eq(mediaPartners.userId, auth.user.id)).limit(1);
    if (!partner || partner.partnerType !== "personal") return NextResponse.json({ error: "ابتدا طرح معرفی کاربران را فعال کنید" }, { status: 404 });
    if (partner.status === "active" && partner.contractAcceptedAt) return NextResponse.json({ error: "شرایط این نسخه قبلاً پذیرفته شده است" }, { status: 409 });
    if (partner.status !== "draft") return NextResponse.json({ error: "وضعیت حساب برای پذیرش شرایط مناسب نیست" }, { status: 409 });
    const [user] = await db.select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, auth.user.id)).limit(1);
    if (!user?.email || !user.emailVerifiedAt) return NextResponse.json({ error: "ایمیل تأییدشده لازم است" }, { status: 403 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`personal-referral-contract:${action}:${auth.user.id}:${ip}`, action === "send_otp" ? 4 : 8, 15 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است" }, { status: 429 });
    if (action === "send_otp") {
      const sent = await EmailService.sendPersonalReferralContractCode(user.email, auth.user.id, PERSONAL_REFERRAL_CONTRACT_VERSION);
      if (!sent.sent) return NextResponse.json({ error: sent.reason === "cooldown" ? "برای ارسال مجدد کمی صبر کنید" : "ارسال کد انجام نشد" }, { status: sent.reason === "cooldown" ? 429 : 503 });
      return NextResponse.json({ ok: true, emailHint: user.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2"), devCode: sent.code });
    }
    if (action !== "sign") return NextResponse.json({ error: "عملیات نامعتبر" }, { status: 400 });
    const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
    const signerName = String(body.signerName || "").trim().replace(/\s+/g, " ").slice(0, 160);
    const confirmations = Array.isArray(body.confirmations) ? body.confirmations : [];
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "کد OTP باید ۶ رقم باشد" }, { status: 400 });
    if (signerName.toLocaleLowerCase("fa") !== partner.legalName.trim().replace(/\s+/g, " ").toLocaleLowerCase("fa")) return NextResponse.json({ error: "نام امضاکننده باید با نام حساب یکسان باشد" }, { status: 400 });
    if (confirmations.length !== PERSONAL_REFERRAL_CONFIRMATIONS.length || confirmations.some((value: unknown) => value !== true)) return NextResponse.json({ error: "پذیرش تمام بندها الزامی است" }, { status: 400 });
    const now = new Date();
    await db.transaction(async (tx) => {
      await EmailService.consumePersonalReferralContractCode(auth.user!.id, PERSONAL_REFERRAL_CONTRACT_VERSION, code, tx);
      await tx.insert(mediaPartnerAgreements).values({
        partnerId: partner.id,
        userId: auth.user!.id,
        contractVersion: PERSONAL_REFERRAL_CONTRACT_VERSION,
        contentHash: PERSONAL_REFERRAL_CONTRACT_HASH,
        contentSnapshot: PERSONAL_REFERRAL_CONTRACT_TEXT,
        signerName,
        ipAddress: ip.slice(0,45),
        userAgent: (request.headers.get("user-agent") || "unknown").slice(0,500),
        otpVerifiedAt: now,
        acceptedAt: now,
      });
      await tx.update(mediaPartners).set({ status: "active", contractAcceptedAt: now, approvedAt: now, updatedAt: now })
        .where(and(eq(mediaPartners.id, partner.id), eq(mediaPartners.userId, auth.user!.id)));
      await tx.insert(notifications).values({
        userId: auth.user!.id,
        type: "personal_referral_activated",
        title: "طرح معرفی کاربران فعال شد",
        message: "لینک معرفی اختصاصی شما فعال شد. کمیسیون Match پولی تأییدشده پس از دوره بررسی ۷۲ساعته قابل برداشت می‌شود.",
        link: "/referrals",
      });
    });
    return NextResponse.json({ ok: true, signed: true, status: "active" });
  } catch (error) {
    if (error instanceof InvalidOtpError) return NextResponse.json({ error: error.message }, { status: 400 });
    logger.error({ error }, "Personal referral contract POST failed");
    return NextResponse.json({ error: "پذیرش شرایط انجام نشد" }, { status: 500 });
  }
}
