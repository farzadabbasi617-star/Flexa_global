import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ilike } from "drizzle-orm";
import { EmailOtpRequestSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { EmailService } from "@/lib/email-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Re-sends the registration email OTP. Used by the "Resend code" button on
 * the verification screen. Has its own IP rate limit on top of the
 * per-email cooldown enforced inside EmailService.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

    const rateLimitResult = await rateLimit(`resend-otp:${ip}`, 5, 10 * 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "تعداد درخواست‌ها زیاد است. لطفاً کمی بعد دوباره امتحان کنید." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validation = EmailOtpRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || "ایمیل معتبر نیست" },
        { status: 400 }
      );
    }

    const { email } = validation.data;

    const [user] = await db.select().from(users).where(ilike(users.email, email));
    if (!user) {
      // Don't reveal whether the email exists — respond the same way either
      // way to avoid leaking account existence.
      return NextResponse.json({ sent: true });
    }
    if (user.emailVerifiedAt) {
      return NextResponse.json({ error: "این ایمیل قبلاً تایید شده است" }, { status: 400 });
    }

    const result = await EmailService.sendVerificationCode(email);
    if (!result.sent) {
      if (result.reason === "cooldown") {
        const seconds = Math.ceil((result.cooldownMs || 0) / 1000);
        return NextResponse.json(
          { error: `لطفاً ${seconds} ثانیه صبر کنید و دوباره امتحان کنید.` },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "سرویس ایمیل در دسترس نیست. تنظیمات Resend و دامنه فرستنده را بررسی کنید." },
        { status: 503 }
      );
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    logger.error({ err }, "Resend email OTP error");
    return NextResponse.json({ error: "ارسال مجدد کد با خطا مواجه شد" }, { status: 500 });
  }
}
