import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { requireRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "super_admin"]);
  if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const images = await db.select().from(siteImages);
    return NextResponse.json(images);
  } catch (error) {
    return NextResponse.json({ error: "Error fetching images" }, { status: 500 });
  }
}
