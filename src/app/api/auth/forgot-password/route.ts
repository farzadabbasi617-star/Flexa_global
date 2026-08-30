import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ilike } from "drizzle-orm";
import { PasswordResetRequestSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { EmailService, getEmailDeliveryConfiguration } from "@/lib/email-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const GENERIC_MESSAGE = "اگر حسابی با این ایمیل وجود داشته باشد، کد بازیابی ارسال می‌شود.";

function emailRateKey(email: string) {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ipLimit = await rateLimit(`forgot-password:ip:${ip}`, 5, 15 * 60 * 1000);
    if (!ipLimit.success) {
      return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است. کمی بعد دوباره امتحان کنید." }, { status: 429 });
    }

    const emailConfig = getEmailDeliveryConfiguration();
    if (!emailConfig.configured || emailConfig.sandboxSender) {
      return NextResponse.json(
        {
          error: emailConfig.sandboxSender
            ? "فرستنده آزمایشی Resend برای کاربران عمومی قابل استفاده نیست. دامنه فرستنده را تایید کنید."
            : "سرویس ایمیل آماده نیست. Google Apps Script URL و Secret را طبق راهنمای پروژه در Render تنظیم کنید.",
        },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const validation = PasswordResetRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0]?.message || "ایمیل معتبر نیست" }, { status: 400 });
    }

    const { email } = validation.data;
    const accountLimit = await rateLimit(`forgot-password:email:${emailRateKey(email)}`, 3, 60 * 60 * 1000);
    if (!accountLimit.success) {
      // Keep the response generic so this endpoint cannot be used to discover
      // registered email addresses.
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
    }

    const [user] = await db
      .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(ilike(users.email, email))
      .limit(1);

    if (user?.email && user.emailVerifiedAt) {
      const result = await EmailService.sendPasswordResetCode(user.email);
      logger.info({ userId: user.id, sent: result.sent }, "Password reset OTP requested");
    } else {
      // Small fixed delay makes the no-account branch less useful for trivial
      // timing-based enumeration without slowing normal users noticeably.
      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (err) {
    logger.error({ err }, "Forgot password request failed");
    // Keep provider/DB details private and preserve account non-enumeration.
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  }
}
