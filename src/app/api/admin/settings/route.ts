import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest) {
  try {
    const { error, status } = await requireAdminPermission(request, "settings");
    if (error) return NextResponse.json({ error }, { status });

    const settings = await db.select().from(siteSettings);
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value || "";
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, status } = await requireAdminPermission(request, "settings");
    if (error) return NextResponse.json({ error }, { status });

    const body = await request.json();

    for (const [key, value] of Object.entries(body)) {
      const [existing] = await db
        .select()
        .from(siteSettings)
        .where(eq(siteSettings.key, key));

      if (existing) {
        await db
          .update(siteSettings)
          .set({ value: String(value), updatedAt: new Date() })
          .where(eq(siteSettings.key, key));
      } else {
        await db
          .insert(siteSettings)
          .values({ key, value: String(value) });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
