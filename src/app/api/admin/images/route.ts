import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { siteImages } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { error, status } = await requireAdminPermission(request, "media");
    if (error) return NextResponse.json({ error }, { status });

    const images = await db
      .select()
      .from(siteImages)
      .orderBy(asc(siteImages.sortOrder), desc(siteImages.createdAt));
    return NextResponse.json(images);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, status } = await requireAdminPermission(request, "media");
    if (error) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { slug, title, url, altText, category, sortOrder } = body;

    if (!slug || !title || !url) {
      return NextResponse.json({ error: "slug, title, url required" }, { status: 400 });
    }

    // Check if slug already exists
    const existing = await db
      .select()
      .from(siteImages)
      .where(eq(siteImages.slug, slug));

    if (existing.length > 0) {
      // Update existing
      const [updated] = await db
        .update(siteImages)
        .set({
          title,
          url,
          altText: altText || null,
          category: category || "general",
          sortOrder: sortOrder ?? 0,
          isActive: true,
        })
        .where(eq(siteImages.slug, slug))
        .returning();
      return NextResponse.json(updated);
    }

    // Insert new - explicitly set isActive: true
    const [image] = await db
      .insert(siteImages)
      .values({
        slug,
        title,
        url,
        altText: altText || null,
        category: category || "general",
        sortOrder: sortOrder ?? 0,
        isActive: true,
      })
      .returning();

    return NextResponse.json(image, { status: 201 });
  } catch (err) {
    console.error("Image POST error:", err);
    return NextResponse.json({ error: "Failed to save image" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { error, status } = await requireAdminPermission(request, "media");
    if (error) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Don't include id in the update
    const { id: _id, ...updateData } = data;

    const [updated] = await db
      .update(siteImages)
      .set(updateData)
      .where(eq(siteImages.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, status } = await requireAdminPermission(request, "media");
    if (error) return NextResponse.json({ error }, { status });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(siteImages).where(eq(siteImages.id, id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
