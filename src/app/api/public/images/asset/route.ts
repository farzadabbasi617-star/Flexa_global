import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

// Streams a site image by slug (or the first active image of a category)
// with proper browser/CDN caching. This avoids embedding multi-hundred-KB
// base64 data URLs inside the HTML/RSC payload, which was the main cause of
// slow homepage loads on mobile.
export const dynamic = "force-dynamic";

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } | null {
  const match = /^data:([a-zA-Z0-9/+\-.]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1] || "image/jpeg";
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
  if (!buffer.length) return null;
  return { contentType, buffer };
}

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
};

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const category = request.nextUrl.searchParams.get("category");

  if (!slug && !category) {
    return NextResponse.json({ error: "slug or category is required" }, { status: 400 });
  }

  try {
    const conditions = [eq(siteImages.isActive, true)];
    if (slug) {
      conditions.push(eq(siteImages.slug, slug));
    } else {
      conditions.push(eq(siteImages.category, category as string));
    }

    const [image] = await db
      .select()
      .from(siteImages)
      .where(and(...conditions))
      .orderBy(asc(siteImages.sortOrder))
      .limit(1);

    if (!image) {
      return new NextResponse("Not found", { status: 404, headers: CACHE_HEADERS });
    }

    const rawUrl = image.url || "";

    const data = parseDataUrl(rawUrl);
    if (data) {
      return new NextResponse(new Uint8Array(data.buffer), {
        status: 200,
        headers: {
          "Content-Type": data.contentType,
          "Content-Length": String(data.buffer.length),
          ...CACHE_HEADERS,
        },
      });
    }

    if (/^https?:\/\//i.test(rawUrl)) {
      return NextResponse.redirect(rawUrl, { status: 307, headers: CACHE_HEADERS });
    }

    return new NextResponse("Unsupported image source", { status: 415 });
  } catch {
    return new NextResponse("Error", { status: 500 });
  }
}
