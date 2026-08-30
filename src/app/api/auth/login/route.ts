import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or, ilike } from "drizzle-orm";
import { verifyPassword, createSession, sessionCookieMaxAge } from "@/lib/auth";
import { LoginSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { withRequestLogging } from "@/lib/with-request-logging";

export const dynamic = "force-dynamic";

async function POSTHandler(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const rateLimitResult = await rateLimit(`login:${ip}`, 5, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "تعداد تلاش‌های ورود زیاد است. لطفاً کمی بعد دوباره امتحان کنید." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const validation = LoginSchema.safeParse({
      identifier: body.emailOrUsername ?? body.identifier,
      password: body.password,
      rememberMe: body.rememberMe,
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          error: validation.error.issues[0]?.message || "اطلاعات ورود معتبر نیست",
          details: validation.error.issues,
        },
        { status: 400 }
      );
    }

    const { identifier, password, rememberMe } = validation.data;

    // Use ilike for case-insensitive username and email search
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(
          ilike(users.email, identifier),
          ilike(users.username, identifier),
          eq(users.phoneNumber, identifier)
        )
      );

    if (!user) {
      logger.warn({ identifier }, "Login attempt failed: User not found");
      return NextResponse.json({ error: "شماره موبایل/نام کاربری یا رمز عبور اشتباه است" }, { status: 401 });
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      logger.warn({ userId: user.id }, "Login attempt failed: Wrong password");
      return NextResponse.json({ error: "شماره موبایل/نام کاربری یا رمز عبور اشتباه است" }, { status: 401 });
    }

    // The account exists and the password is correct, but registration's
    // email OTP step was never completed. Block login here too — otherwise
    // a user could skip email verification entirely by just logging in
    // with the password they set during signup.
    if (!user.emailVerifiedAt) {
      logger.warn({ userId: user.id }, "Login blocked: email not verified");
      return NextResponse.json(
        {
          error: "ابتدا باید ایمیل خود را تایید کنید.",
          pendingVerification: true,
          email: user.email,
        },
        { status: 403 }
      );
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    const token = await createSession(user.id, ip, userAgent, rememberMe);

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
      maxAge: sessionCookieMaxAge(rememberMe),
      path: "/",
    });

    logger.info({ userId: user.id, authMode: "password_without_sms", rememberMe }, "User logged in successfully");
    return response;
  } catch (err) {
    logger.error({ err }, "Login error");
    return NextResponse.json({ error: "ورود با خطا مواجه شد" }, { status: 500 });
  }
}


export const POST = withRequestLogging(POSTHandler);
