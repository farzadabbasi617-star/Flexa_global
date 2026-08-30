import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import logger from "@/lib/logger";

export async function logAdminAction(input: {
  adminId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
}) {
  try {
    await db.insert(adminAuditLogs).values({
      adminId: input.adminId || null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId || null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress || null,
    });
  } catch (err) {
    // Audit logging should never break the primary admin operation.
    logger.warn({ err, action: input.action }, "Admin audit log failed");
  }
}

export function getClientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
}
