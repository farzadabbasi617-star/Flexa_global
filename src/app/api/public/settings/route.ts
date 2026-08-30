import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { publicCacheHeaders, ttlCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const settings = await ttlCache("public-settings", 60_000, () => db.select().from(siteSettings));
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value || "";
    }
    return NextResponse.json(result, { headers: publicCacheHeaders(60, 300) });
  } catch {
    return NextResponse.json({});
  }
}
