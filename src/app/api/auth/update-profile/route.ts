import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { ClashRoyaleApiError, createClashRoyaleApiClient, normalizeClashRoyaleTag } from "@/lib/clash-royale-api";
import logger from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { notifyTelegramAdmins } from "@/lib/telegram";
import { resolveAvatarUrl } from "@/lib/avatars";

export const dynamic = "force-dynamic";

// Strict list of allowed exclusive Flexa avatars to protect exclusivity (and future purchases/sales)

function html(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function appUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.flexa1.ir").replace(/\/$/, "");
}

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await validateSession(token, ip, ua, request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const limit = await rateLimit(`profile:update:${user.id}:${ip}`, 20, 60_000);
    if (!limit.success) return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است؛ کمی صبر کن." }, { status: 429 });

    const body = await request.json();
    const {
      displayName,
      avatarUrl,
      clashRoyaleId,
      clashRoyaleUsername,
      codMobileId,
      codMobileUsername,
      codMobileRegion,
      fortniteId,
      fortniteUsername,
    } = body;

    const updateData: Record<string, string | null> = {};

    if (displayName !== undefined) {
      const publicName = String(displayName).trim();
      if (publicName.length < 2 || publicName.length > 100 || /[\u0000-\u001f\u007f]/.test(publicName)) {
        return NextResponse.json({ error: "نام داخل Flexa باید بین ۲ تا ۱۰۰ کاراکتر باشد." }, { status: 400 });
      }
      updateData.displayName = publicName;
    }
    
    // Strict backend enforcement of premium avatars
    if (avatarUrl !== undefined) {
      const url = String(avatarUrl || "").trim();
      updateData.avatarUrl = resolveAvatarUrl(url);
    }
    
    if (clashRoyaleId !== undefined) {
      const rawTag = String(clashRoyaleId || "").trim();
      if (!rawTag) {
        updateData.clashRoyaleId = null;
        updateData.clashRoyaleUsername = null;
        updateData.clashRoyaleStatus = "unlinked";
      } else {
        const normalizedTag = normalizeClashRoyaleTag(rawTag);
        if (!normalizedTag) {
          return NextResponse.json({ error: "Player Tag کلش رویال معتبر نیست." }, { status: 400 });
        }
        const [duplicate] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.clashRoyaleId, normalizedTag), ne(users.id, user.id)))
          .limit(1);
        if (duplicate) {
          return NextResponse.json({ error: "این Player Tag قبلاً به حساب دیگری متصل شده است." }, { status: 409 });
        }

        const clashPlayer = await createClashRoyaleApiClient().getPlayer(normalizedTag);
        updateData.clashRoyaleId = normalizeClashRoyaleTag(clashPlayer.tag) || normalizedTag;
        updateData.clashRoyaleUsername = String(clashPlayer.name || "").trim().slice(0, 100);
        updateData.clashRoyaleStatus = "verified";
      }
    }
    // Clash Royale username is authoritative from Supercell and cannot be
    // overwritten manually. Keep the old request field only for compatibility.
    void clashRoyaleUsername;
    let codIdentityChanged = false;
    if (codMobileRegion !== undefined) {
      const region = String(codMobileRegion || "").toLowerCase();
      if (!["global", "garena"].includes(region)) {
        return NextResponse.json({ error: "ریجن کالاف باید Global یا Garena باشد." }, { status: 400 });
      }
      updateData.codMobileRegion = region;
      codIdentityChanged ||= region !== user.codMobileRegion;
    }
    if (codMobileId !== undefined || codMobileUsername !== undefined) {
      const nextId = codMobileId !== undefined ? String(codMobileId || "").trim().slice(0, 100) : user.codMobileId;
      const nextUsername = codMobileUsername !== undefined ? String(codMobileUsername || "").trim().slice(0, 100) : user.codMobileUsername;
      updateData.codMobileId = nextId || null;
      updateData.codMobileUsername = nextUsername || null;
      codIdentityChanged ||= (nextId || null) !== user.codMobileId || (nextUsername || null) !== user.codMobileUsername;
      if (!nextId || !nextUsername) updateData.codMobileStatus = "unlinked";
    }
    if (codIdentityChanged && updateData.codMobileStatus !== "unlinked") updateData.codMobileStatus = "pending";
    if (fortniteId !== undefined) updateData.fortniteId = fortniteId || null;
    if (fortniteUsername !== undefined) updateData.fortniteUsername = fortniteUsername || null;

    if (!Object.keys(updateData).length) {
      return NextResponse.json({ error: "هیچ تغییری برای ذخیره ارسال نشده است." }, { status: 400 });
    }

    const updated = await db.transaction(async (tx) => {
      const [nextUser] = await tx
        .update(users)
        .set(updateData)
        .where(eq(users.id, user.id))
        .returning();

      if (!nextUser) throw new Error("PROFILE_USER_NOT_FOUND");

      // `players` is the public snapshot used by matchmaking, brackets and
      // leaderboards. Update it atomically so the legal name can never linger
      // in a match after the user chooses a gamer name such as "Farzadov".
      const playerProfile: { displayName?: string; avatarUrl?: string | null } = {};
      if (updateData.displayName !== undefined) playerProfile.displayName = nextUser.displayName;
      if (updateData.avatarUrl !== undefined) playerProfile.avatarUrl = nextUser.avatarUrl;
      if (Object.keys(playerProfile).length) {
        await tx.update(players).set(playerProfile).where(eq(players.visibleUserId, user.id));
      }

      return nextUser;
    });

    if (codIdentityChanged && updated.codMobileStatus === "pending" && updated.codMobileId && updated.codMobileUsername) {
      await notifyTelegramAdmins([
        "🎯 <b>درخواست جدید تأیید UID کالاف</b>",
        "",
        `کاربر: <b>${html(updated.displayName)}</b>`,
        `Flexa ID: <code>${html(updated.flexaId)}</code>`,
        `COD UID: <code>${html(updated.codMobileId)}</code>`,
        `COD Username: <code>${html(updated.codMobileUsername)}</code>`,
        `Region: <b>${html(updated.codMobileRegion?.toUpperCase())}</b>`,
        "",
        "برای تأیید، وارد پنل ادمین شو.",
      ].join("\n"), {
        inline_keyboard: [[{ text: "✅ بررسی UID کالاف", url: `${appUrl()}/admin/cod-profiles` }]],
      }).catch((err) => logger.warn({ err, userId: updated.id }, "Failed to notify admins for pending COD profile"));
    }

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        phoneNumber: updated.phoneNumber,
        phoneVerifiedAt: updated.phoneVerifiedAt,
        emailVerifiedAt: updated.emailVerifiedAt,
        username: updated.username,
        firstName: updated.firstName,
        lastName: updated.lastName,
        displayName: updated.displayName,
        birthDate: updated.birthDate,
        nationalId: updated.nationalId,
        flexaId: updated.flexaId,
        role: updated.role,
        avatarUrl: updated.avatarUrl,
        isVerified: updated.isVerified,
        level: updated.level,
        rankPoints: updated.rankPoints,
        xp: updated.xp,
        clashRoyaleId: updated.clashRoyaleId,
        clashRoyaleUsername: updated.clashRoyaleUsername,
        clashRoyaleStatus: updated.clashRoyaleStatus,
        codMobileId: updated.codMobileId,
        codMobileUsername: updated.codMobileUsername,
        codMobileRegion: updated.codMobileRegion,
        codMobileStatus: updated.codMobileStatus,
        fortniteId: updated.fortniteId,
        fortniteUsername: updated.fortniteUsername,
        metadata: updated.metadata,
      },
    });
  } catch (error) {
    if (error instanceof ClashRoyaleApiError) {
      if (error.status === 404) return NextResponse.json({ error: "Player Tag در Clash Royale پیدا نشد." }, { status: 404 });
      if (error.status === 403) return NextResponse.json({ error: "کلید API یا IP مجاز Clash Royale مشکل دارد." }, { status: 502 });
      if (error.status === 503) return NextResponse.json({ error: "Clash Royale API هنوز تنظیم نشده است." }, { status: 503 });
      return NextResponse.json({ error: "استعلام Player Tag از Clash Royale انجام نشد." }, { status: 502 });
    }
    logger.error({ error, userId: request.cookies.has("session") ? "authenticated" : "unknown" }, "Profile update failed");
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
