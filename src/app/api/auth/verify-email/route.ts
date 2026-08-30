import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ilike } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { EmailOtpVerifySchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { EmailService, InvalidOtpError } from "@/lib/email-service";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Confirms the emailed OTP sent during registration and, on success, logs
 * the user in (creates the session cookie) — this is the second/final step
 * of the two-step signup flow started by POST /api/auth/register.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const rateLimitResult = await rateLimit(`verify-email:${ip}`, 10, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "تعداد تلاش‌های زیادی انجام شده. لطفاً کمی صبر کنید." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validation = EmailOtpVerifySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message || "اطلاعات نامعتبر است" },
        { status: 400 }
      );
    }

    const { email, code } = validation.data;

    try {
      await EmailService.verifyCode(email, code);
    } catch (err) {
      if (err instanceof InvalidOtpError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      // Anything else (DB connectivity, etc.) is an internal failure — log
      // full detail server-side but never leak raw error/SQL text to the
      // client.
      logger.error({ err }, "Email OTP verification internal error");
      return NextResponse.json({ error: "تایید ایمیل با خطا مواجه شد" }, { status: 500 });
    }

    const [user] = await db.select().from(users).where(ilike(users.email, email));
    if (!user) {
      return NextResponse.json({ error: "کاربری با این ایمیل پیدا نشد" }, { status: 404 });
    }

    const token = await createSession(user.id, ip, userAgent);

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        phoneVerifiedAt: user.phoneVerifiedAt,
        emailVerifiedAt: user.emailVerifiedAt,
        username: user.username,
        displayName: user.displayName,
        flexaId: user.flexaId,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isVerified: user.isVerified,
        level: user.level,
        rankPoints: user.rankPoints,
        xp: user.xp,
        clashRoyaleId: user.clashRoyaleId,
        clashRoyaleUsername: user.clashRoyaleUsername,
        codMobileId: user.codMobileId,
        codMobileUsername: user.codMobileUsername,
        fortniteId: user.fortniteId,
        fortniteUsername: user.fortniteUsername,
        metadata: user.metadata,
      },
    });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });

    logger.info({ userId: user.id, authMode: "email_otp" }, "Email verified, user logged in");
    return response;
  } catch (err) {
    logger.error({ err }, "Email verification error");
    return NextResponse.json({ error: "تایید ایمیل با خطا مواجه شد" }, { status: 500 });
  }
}
