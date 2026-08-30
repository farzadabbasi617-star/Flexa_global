import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function validateSetupSecret(request: NextRequest) {
  const configuredSecret = process.env.ADMIN_SETUP_SECRET;

  // In production the bootstrap endpoint must never be usable with only a
  // logged-in account. A leaked fresh database or a race right after deploy
  // would otherwise let the first registrant become super_admin.
  if (process.env.NODE_ENV === "production" && !configuredSecret) {
    return { ok: false, error: "ADMIN_SETUP_SECRET is not configured", status: 503 };
  }

  // For local development we keep the old one-click flow if no secret is set.
  if (!configuredSecret) return { ok: true };

  const headerSecret = request.headers.get("x-admin-setup-secret") || "";
  let bodySecret = "";

  try {
    const body = await request.clone().json();
    bodySecret = typeof body?.setupSecret === "string" ? body.setupSecret : "";
  } catch {
    // Body is optional; header-based setup is supported.
  }

  if (headerSecret !== configuredSecret && bodySecret !== configuredSecret) {
    return { ok: false, error: "Invalid setup secret", status: 403 };
  }

  return { ok: true };
}

// Makes the current logged-in user the main manager (super_admin).
// Rules:
// 1) If no admin exists yet, the first logged-in user can become super_admin,
//    but production also requires ADMIN_SETUP_SECRET.
// 2) If old setup already created an admin but no super_admin exists, that admin
//    can upgrade themselves to super_admin.
export async function POST(request: NextRequest) {
  try {
    const secretCheck = await validateSetupSecret(request);
    if (!secretCheck.ok) {
      return NextResponse.json({ error: secretCheck.error }, { status: secretCheck.status });
    }

    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";

    if (!token) return NextResponse.json({ error: "Login first" }, { status: 401 });

    const user = await validateSession(token, ip, ua, request);
    if (!user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const [superAdminCount] = await db
      .select({ v: count() })
      .from(users)
      .where(eq(users.role, "super_admin"));

    if (superAdminCount.v > 0) {
      return NextResponse.json({ error: "Super admin already exists" }, { status: 400 });
    }

    const [adminCount] = await db
      .select({ v: count() })
      .from(users)
      .where(eq(users.role, "admin"));

    if (adminCount.v > 0 && user.role !== "admin") {
      return NextResponse.json({ error: "An admin already exists. Ask the current admin to run setup." }, { status: 403 });
    }

    await db.update(users).set({ role: "super_admin" }).where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      message: `${user.displayName} is now super admin`,
    });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
