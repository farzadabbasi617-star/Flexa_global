import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateAdmin } from "@/lib/auth";
import { ADMIN_PERMISSIONS, getAdminPermissions, isKnownPermission, setAdminPermissions } from "@/lib/admin-permissions";
import { getClientIp, logAdminAction } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateAdmin(request);
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ allPermissions: ADMIN_PERMISSIONS, labels: null, permissions: [] });
    }

    const permissions = await getAdminPermissions(userId);
    return NextResponse.json({ allPermissions: ADMIN_PERMISSIONS, permissions });
  } catch {
    return NextResponse.json({ error: "Failed to load permissions" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateAdmin(request);
    if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.user.role !== "super_admin") {
      return NextResponse.json({ error: "فقط مدیر اصلی می‌تواند سطح دسترسی تعیین کند" }, { status: 403 });
    }

    const body = await request.json();
    const userId = String(body.userId || "");
    const permissionsInput = Array.isArray(body.permissions) ? body.permissions.map(String) : [];
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const [target] = await db.select({ id: users.id, role: users.role, username: users.username }).from(users).where(eq(users.id, userId));
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (target.role !== "admin" && target.role !== "moderator" && target.role !== "judge") {
      return NextResponse.json({ error: "سطح دسترسی فقط برای ادمین/داور/ناظر قابل تنظیم است" }, { status: 400 });
    }

    const permissions = permissionsInput.filter(isKnownPermission);
    await setAdminPermissions(userId, permissions);

    await logAdminAction({
      adminId: auth.user.id,
      action: "set_permissions",
      entityType: "user",
      entityId: userId,
      metadata: { permissions, targetUsername: target.username },
      ipAddress: getClientIp(request.headers),
    });

    return NextResponse.json({ success: true, permissions });
  } catch {
    return NextResponse.json({ error: "Failed to save permissions" }, { status: 500 });
  }
}
