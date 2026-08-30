import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { players, sessions, users, wallets } from "@/db/schema";
import { eq, desc, or } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { normalizePhoneNumber } from "@/lib/phone";
import { TERMS_VERSION } from "@/lib/terms";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

const ROLES = ["player", "judge", "moderator", "admin", "super_admin"] as const;
type Role = (typeof ROLES)[number];

async function generateUniqueFlexaId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `FLX-${crypto.randomInt(1000, 10000)}`;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.flexaId, candidate)).limit(1);
    if (!existing) return candidate;
  }
  return `FLX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function publicUserShape(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    phoneNumber: u.phoneNumber,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    isVerified: u.isVerified,
    clashRoyaleId: u.clashRoyaleId,
    codMobileId: u.codMobileId,
    fortniteId: u.fortniteId,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { error, status } = await requireAdminPermission(request, "users");
    if (error) return NextResponse.json({ error }, { status });

    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    return NextResponse.json(allUsers.map(publicUserShape));
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: currentUser, error, status } = await requireAdminPermission(request, "users");
    if (error || !currentUser) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const phoneNumber = normalizePhoneNumber(String(body.phoneNumber || ""));
    const username = String(body.username || "").trim();
    const displayName = String(body.displayName || "").trim();
    const password = String(body.password || "");
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const requestedRole = (body.role || "player") as Role;

    if (!/^09\d{9}$/.test(phoneNumber)) return NextResponse.json({ error: "شماره موبایل معتبر نیست" }, { status: 400 });
    if (username.length < 3) return NextResponse.json({ error: "نام کاربری حداقل ۳ کاراکتر باشد" }, { status: 400 });
    if (displayName.length < 2) return NextResponse.json({ error: "نام نمایشی الزامی است" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "رمز عبور حداقل ۶ کاراکتر باشد" }, { status: 400 });
    if (!ROLES.includes(requestedRole)) return NextResponse.json({ error: "نقش معتبر نیست" }, { status: 400 });
    if ((requestedRole === "admin" || requestedRole === "super_admin") && currentUser.role !== "super_admin") {
      return NextResponse.json({ error: "فقط مدیر اصلی می‌تواند ادمین بسازد" }, { status: 403 });
    }

    const existing = await db
      .select({ id: users.id, phoneNumber: users.phoneNumber, username: users.username, email: users.email })
      .from(users)
      .where(email ? or(eq(users.phoneNumber, phoneNumber), eq(users.username, username), eq(users.email, email)) : or(eq(users.phoneNumber, phoneNumber), eq(users.username, username)));

    if (existing.some((u) => u.phoneNumber === phoneNumber)) return NextResponse.json({ error: "شماره موبایل قبلاً ثبت شده" }, { status: 409 });
    if (existing.some((u) => u.username === username)) return NextResponse.json({ error: "نام کاربری قبلاً ثبت شده" }, { status: 409 });
    if (email && existing.some((u) => u.email === email)) return NextResponse.json({ error: "ایمیل قبلاً ثبت شده" }, { status: 409 });

    const passwordHash = await hashPassword(password);
    const flexaId = await generateUniqueFlexaId();

    const created = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          phoneNumber,
          username,
          email,
          displayName,
          passwordHash,
          flexaId,
          role: requestedRole,
          isVerified: true,
          phoneVerifiedAt: new Date(),
          // Admin-created accounts skip the self-serve email OTP step
          // entirely (the admin already vouches for the account), so mark
          // it verified immediately — otherwise this user would be locked
          // out of login by the emailVerifiedAt check.
          emailVerifiedAt: new Date(),
          termsAcceptedAt: new Date(),
          termsVersion: TERMS_VERSION,
        })
        .returning();

      await tx.insert(players).values({ visibleUserId: u.id, username: username, displayName, email });
      await tx.insert(wallets).values({ userId: u.id, balance: "0", currency: "RIAL" });
      return u;
    });

    await logAdminAction({
      adminId: currentUser.id,
      action: "create",
      entityType: "user",
      entityId: created.id,
      metadata: { username, role: requestedRole },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json(publicUserShape(created), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user: currentUser, error, status } = await requireAdminPermission(request, "users");
    if (error || !currentUser) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { id, role, isVerified } = body;

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const updateData: Record<string, unknown> = {};

    if (role !== undefined) {
      if (!ROLES.includes(role as Role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      if ((role === "admin" || role === "super_admin") && currentUser.role !== "super_admin") {
        return NextResponse.json({ error: "Only super admin can assign admin roles" }, { status: 403 });
      }

      updateData.role = role;
    }

    if (isVerified !== undefined) updateData.isVerified = Boolean(isVerified);

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning({ id: users.id, role: users.role, isVerified: users.isVerified });

    await logAdminAction({
      adminId: currentUser.id,
      action: "update",
      entityType: "user",
      entityId: id,
      metadata: updateData,
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user: currentUser, error, status } = await requireAdminPermission(request, "users");
    if (error || !currentUser) return NextResponse.json({ error }, { status });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (id === currentUser.id) return NextResponse.json({ error: "نمی‌توانی حساب خودت را حذف کنی" }, { status: 400 });

    const [target] = await db.select().from(users).where(eq(users.id, id));
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if ((target.role === "admin" || target.role === "super_admin") && currentUser.role !== "super_admin") {
      return NextResponse.json({ error: "فقط مدیر اصلی می‌تواند ادمین را حذف کند" }, { status: 403 });
    }

    // Safe-delete/anonymize: keeps historical tournament/match relations intact.
    const suffix = id.replaceAll("-", "").slice(0, 12);
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx
        .update(users)
        .set({
          phoneNumber: `del_${suffix}`,
          username: `deleted_${suffix}`,
          email: null,
          displayName: "کاربر حذف‌شده",
          avatarUrl: null,
          bio: null,
          isVerified: false,
          role: "player",
        })
        .where(eq(users.id, id));
    });

    await logAdminAction({
      adminId: currentUser.id,
      action: "safe_delete",
      entityType: "user",
      entityId: id,
      metadata: { previousUsername: target.username, previousRole: target.role },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
