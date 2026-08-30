import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mediaPartnerAgreements, mediaPartners, notifications, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { EmailService, InvalidOtpError } from "@/lib/email-service";
import { ensureAffiliateSchema } from "@/lib/affiliate-service";
import {
  MEDIA_PARTNER_CONTRACT_HASH,
  MEDIA_PARTNER_CONTRACT_TEXT,
  MEDIA_PARTNER_CONTRACT_TITLE,
  MEDIA_PARTNER_CONTRACT_VERSION,
  MEDIA_PARTNER_REQUIRED_CONFIRMATIONS,
} from "@/lib/media-partner-contract";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  await ensureAffiliateSchema();
  const [partner] = await db.select({ id: mediaPartners.id, status: mediaPartners.status, legalName: mediaPartners.legalName, contractAcceptedAt: mediaPartners.contractAcceptedAt })
    .from(mediaPartners).where(eq(mediaPartners.userId, auth.user.id)).limit(1);
  const [agreement] = partner ? await db.select({ id: mediaPartnerAgreements.id, acceptedAt: mediaPartnerAgreements.acceptedAt, contentHash: mediaPartnerAgreements.contentHash })
    .from(mediaPartnerAgreements).where(and(eq(mediaPartnerAgreements.partnerId, partner.id), eq(mediaPartnerAgreements.contractVersion, MEDIA_PARTNER_CONTRACT_VERSION))).limit(1) : [];
  return NextResponse.json({
    title: MEDIA_PARTNER_CONTRACT_TITLE,
    version: MEDIA_PARTNER_CONTRACT_VERSION,
    contentHash: MEDIA_PARTNER_CONTRACT_HASH,
    content: MEDIA_PARTNER_CONTRACT_TEXT,
    confirmations: MEDIA_PARTNER_REQUIRED_CONFIRMATIONS,
    partner: partner || null,
    agreement: partner?.status === "draft" || !partner?.contractAcceptedAt ? null : agreement || null,
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
    if (!partner) return NextResponse.json({ error: "ابتدا فرم درخواست همکاری را تکمیل کنید" }, { status: 404 });
    if (!["draft", "rejected"].includes(partner.status)) return NextResponse.json({ error: "قرارداد این درخواست قابل تغییر نیست" }, { status: 409 });
    const [user] = await db.select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, auth.user.id)).limit(1);
    if (!user?.email || !user.emailVerifiedAt) return NextResponse.json({ error: "ایمیل تأییدشده لازم است" }, { status: 403 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limited = await rateLimit(`media-contract:${action}:${auth.user.id}:${ip}`, action === "send_otp" ? 4 : 8, 15 * 60 * 1000);
    if (!limited.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است" }, { status: 429 });

    if (action === "send_otp") {
      const result = await EmailService.sendMediaContractCode(user.email, auth.user.id, MEDIA_PARTNER_CONTRACT_VERSION);
      if (!result.sent) {
        if (result.reason === "cooldown") return NextResponse.json({ error: "برای ارسال مجدد کمی صبر کنید" }, { status: 429 });
        return NextResponse.json({ error: "ارسال کد قرارداد انجام نشد" }, { status: 503 });
      }
      return NextResponse.json({ ok: true, sent: true, emailHint: user.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2"), devCode: result.code });
    }

    if (action !== "sign") return NextResponse.json({ error: "عملیات نامعتبر" }, { status: 400 });
    const code = String(body.code || "").replace(/\D/g, "").slice(0, 6);
    const signerName = String(body.signerName || "").trim().replace(/\s+/g, " ").slice(0, 160);
    const confirmations = Array.isArray(body.confirmations) ? body.confirmations : [];
    if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "کد OTP باید ۶ رقم باشد" }, { status: 400 });
    if (signerName.length < 3 || signerName.toLocaleLowerCase("fa") !== partner.legalName.trim().replace(/\s+/g, " ").toLocaleLowerCase("fa")) {
      return NextResponse.json({ error: "نام امضاکننده باید دقیقاً با نام قانونی فرم یکسان باشد" }, { status: 400 });
    }
    if (confirmations.length !== MEDIA_PARTNER_REQUIRED_CONFIRMATIONS.length || confirmations.some((value: unknown) => value !== true)) {
      return NextResponse.json({ error: "پذیرش تمام بندهای ضروری قرارداد الزامی است" }, { status: 400 });
    }
    const now = new Date();
    await db.transaction(async (tx) => {
      await EmailService.consumeMediaContractCode(auth.user!.id, MEDIA_PARTNER_CONTRACT_VERSION, code, tx);
      await tx.insert(mediaPartnerAgreements).values({
        partnerId: partner.id,
        userId: auth.user!.id,
        contractVersion: MEDIA_PARTNER_CONTRACT_VERSION,
        contentHash: MEDIA_PARTNER_CONTRACT_HASH,
        contentSnapshot: MEDIA_PARTNER_CONTRACT_TEXT,
        signerName,
        ipAddress: ip.slice(0, 45),
        userAgent: (request.headers.get("user-agent") || "unknown").slice(0, 500),
        otpVerifiedAt: now,
        acceptedAt: now,
      });
      await tx.update(mediaPartners).set({ status: "pending", contractAcceptedAt: now, rejectionReason: null, updatedAt: now })
        .where(and(eq(mediaPartners.id, partner.id), eq(mediaPartners.userId, auth.user!.id)));
    });
    const adminRows = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["admin", "super_admin"]));
    if (adminRows.length) await db.insert(notifications).values(adminRows.map((admin) => ({
      userId: admin.id,
      type: "media_partner_application",
      title: "درخواست همکاری رسانه‌ای جدید",
      message: `${partner.mediaName} قرارداد نسخه ${MEDIA_PARTNER_CONTRACT_VERSION} را با OTP پذیرفت و منتظر بررسی است.`,
      link: "/admin/media-partners",
    }))).catch((notifyError) => logger.warn({ notifyError, partnerId: partner.id }, "Failed to notify admins about media application"));
    return NextResponse.json({ ok: true, signed: true, status: "pending" });
  } catch (error) {
    if (error instanceof InvalidOtpError) return NextResponse.json({ error: error.message }, { status: 400 });
    logger.error({ error }, "Media partner contract POST failed");
    return NextResponse.json({ error: "ثبت قرارداد انجام نشد" }, { status: 500 });
  }
}
