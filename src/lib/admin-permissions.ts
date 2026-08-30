import { NextRequest } from "next/server";
import { db } from "@/db";
import { adminPermissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateAdmin } from "@/lib/auth";
import logger from "@/lib/logger";

export const ADMIN_PERMISSIONS = [
  "overview",
  "users",
  "tournaments",
  "matches",
  "judgments",
  "disputes",
  "messages",
  "media",
  "wallets",
  "finance",
  "notifications",
  "support",
  "audit",
  "ai",
  "settings",
  "uploads",
  "maintenance",
  "store",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  overview: "داشبورد مدیریت",
  users: "کاربران و نقش‌ها",
  tournaments: "تورنومنت‌ها",
  matches: "مسابقات",
  judgments: "داوری‌ها",
  disputes: "اعتراضات",
  messages: "پیام‌ها",
  media: "تصاویر و ظاهر",
  wallets: "کیف پول کاربران",
  finance: "گزارش مالی",
  notifications: "اعلان‌ها",
  support: "پشتیبانی و تیکت‌ها",
  audit: "لاگ فعالیت مدیران",
  ai: "هوش مصنوعی",
  settings: "تنظیمات سایت",
  uploads: "آپلود فایل",
  maintenance: "نگهداری سیستم",
  store: "فروشگاه و مارکت‌پلیس",
};

export function isKnownPermission(value: string): value is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

export async function getAdminPermissions(userId: string) {
  const rows = await db
    .select({ permission: adminPermissions.permission, allowed: adminPermissions.allowed })
    .from(adminPermissions)
    .where(eq(adminPermissions.userId, userId));

  return rows.filter((row) => row.allowed && isKnownPermission(row.permission)).map((row) => row.permission as AdminPermission);
}

export async function setAdminPermissions(userId: string, permissions: AdminPermission[]) {
  await db.transaction(async (tx) => {
    await tx.delete(adminPermissions).where(eq(adminPermissions.userId, userId));
    if (permissions.length > 0) {
      await tx.insert(adminPermissions).values(
        permissions.map((permission) => ({
          userId,
          permission,
          allowed: true,
          updatedAt: new Date(),
        }))
      );
    }
  });
}

export async function requireAdminPermission(request: NextRequest, permission: AdminPermission) {
  const auth = await validateAdmin(request);
  if (auth.error || !auth.user) return auth;

  if (auth.user.role === "super_admin") {
    return { user: auth.user, error: null, status: 200 };
  }

  try {
    const permissions = await getAdminPermissions(auth.user.id);
    if (permissions.includes(permission)) {
      return { user: auth.user, error: null, status: 200 };
    }
  } catch (err) {
    logger.warn({ err, userId: auth.user.id, permission }, "Failed to load admin permissions");
  }

  return { user: null, error: "Forbidden: missing admin permission", status: 403 };
}
