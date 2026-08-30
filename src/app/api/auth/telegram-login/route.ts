import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { telegramAccounts, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateTelegramMiniAppInitData } from "@/lib/telegram-mini-app-auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    const limit = await rateLimit(`telegram-mini-app-login:${ip}`, 20, 10 * 60 * 1000);
    if (!limit.success) {
      const retryAfter = Math.max(1, Math.ceil(((limit.resetAt || Date.now()) - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many Telegram login attempts" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json().catch(() => null) as { initData?: unknown } | null;
    const initData = body?.initData;

    if (typeof initData !== "string" || !initData.trim() || initData.length > 16_384) {
      return NextResponse.json({ error: "Missing or invalid initData" }, { status: 400 });
    }

    const botToken = process.env.BOT_TOKEN?.trim();
    if (!botToken) {
      logger.error("BOT_TOKEN environment variable is not defined in Flexa settings");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    let tgUser;
    try {
      tgUser = validateTelegramMiniAppInitData(initData, botToken);
    } catch (error) {
      logger.warn(
        { ip, reason: error instanceof Error ? error.name : "unknown" },
        "Rejected invalid or expired Telegram Mini App initData"
      );
      return NextResponse.json({ error: "Invalid or expired Telegram authentication" }, { status: 401 });
    }

    const tgId = String(tgUser.id);

    // Look up linked account in Flexa database
    const [linked] = await db
      .select({ userId: telegramAccounts.userId })
      .from(telegramAccounts)
      .where(eq(telegramAccounts.telegramId, tgId))
      .limit(1);

    if (!linked) {
      return NextResponse.json({
        success: false,
        linked: false,
        telegramUser: tgUser,
        message: "No linked Flexa account found. Link account first inside profile."
      });
    }

    // Load full Flexa user record
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, linked.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "Linked user not found" }, { status: 404 });
    }

    // Defense in depth: linking Telegram already requires an authenticated
    // (and therefore already email-verified) session, so this should be
    // unreachable for an unverified account. Still, block it explicitly so
    // this endpoint alone can never be used to bypass email verification.
    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        { error: "ابتدا باید ایمیل حساب Flexa خود را تایید کنید.", linked: true, requiresEmailVerification: true },
        { status: 403 }
      );
    }

    // Log the user login time
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    // Create session in database
    const token = await createSession(user.id, ip, userAgent);

    const response = NextResponse.json({
      success: true,
      linked: true,
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

    // Write HTTPOnly cookie session
    response.cookies.set("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days session persistence
      path: "/",
    });

    logger.info({ userId: user.id, tgId, authMode: "telegram_mini_app" }, "User logged in automatically via Telegram Mini App");
    return response;
  } catch (err) {
    logger.error({ err }, "Telegram login route error");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
