import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { honorContentLikes, honorContentViews, honors } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { validateSession } from "@/lib/auth";
import { getStaticHonorById } from "@/lib/static-honors";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "flexa_honor_visitor";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTENT_ID_RE = /^[a-zA-Z0-9_-]{3,120}$/;

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown";
}

async function getOptionalUser(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value || "";
    if (!token) return null;
    return await validateSession(token, getClientIp(request), request.headers.get("user-agent") || "unknown", request);
  } catch {
    return null;
  }
}

function getVisitorKey(request: NextRequest, userId?: string | null) {
  if (userId) return { key: `user:${userId}`, visitorId: null };
  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  const visitorId = existing && /^[a-zA-Z0-9_-]{16,80}$/.test(existing) ? existing : crypto.randomUUID();
  return { key: `anon:${visitorId}`, visitorId };
}

async function contentExists(id: string) {
  if (getStaticHonorById(id)) return true;
  if (!UUID_RE.test(id)) return false;
  const [honor] = await db.select({ id: honors.id }).from(honors).where(and(eq(honors.id, id), eq(honors.status, "approved"))).limit(1);
  return Boolean(honor);
}

async function getCounts(contentId: string, visitorKey?: string) {
  const [viewsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(honorContentViews).where(eq(honorContentViews.contentId, contentId));
  const [likesRow] = await db.select({ count: sql<number>`count(*)::int` }).from(honorContentLikes).where(eq(honorContentLikes.contentId, contentId));
  let likedByMe = false;
  if (visitorKey) {
    const [liked] = await db.select({ id: honorContentLikes.id }).from(honorContentLikes).where(and(eq(honorContentLikes.contentId, contentId), eq(honorContentLikes.visitorKey, visitorKey))).limit(1);
    likedByMe = Boolean(liked);
  }
  return { views: Number(viewsRow?.count || 0), likes: Number(likesRow?.count || 0), likedByMe };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!CONTENT_ID_RE.test(id)) return NextResponse.json({ views: 0, likes: 0, likedByMe: false });
  try {
    const user = await getOptionalUser(request);
    const { key } = getVisitorKey(request, user?.id);
    return NextResponse.json(await getCounts(id, key));
  } catch (err) {
    logger.error({ err, honorId: id }, "Honor engagement GET failed");
    return NextResponse.json({ views: 0, likes: 0, likedByMe: false });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!CONTENT_ID_RE.test(id)) return NextResponse.json({ views: 0, likes: 0, likedByMe: false });

  try {
    const exists = await contentExists(id);
    if (!exists) return NextResponse.json({ error: "Honor not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const action = body.action === "like" ? "like" : "view";
    const user = await getOptionalUser(request);
    const { key, visitorId } = getVisitorKey(request, user?.id);
    const ip = getClientIp(request);
    const ua = (request.headers.get("user-agent") || "unknown").slice(0, 300);

    if (action === "view") {
      await db
        .insert(honorContentViews)
        .values({ contentId: id, userId: user?.id || null, visitorKey: key, ipAddress: ip, userAgent: ua, lastSeenAt: new Date() })
        .onConflictDoUpdate({ target: [honorContentViews.contentId, honorContentViews.visitorKey], set: { lastSeenAt: new Date(), userId: user?.id || null } });
    } else {
      const [existing] = await db.select({ id: honorContentLikes.id }).from(honorContentLikes).where(and(eq(honorContentLikes.contentId, id), eq(honorContentLikes.visitorKey, key))).limit(1);
      if (existing) {
        await db.delete(honorContentLikes).where(eq(honorContentLikes.id, existing.id));
      } else {
        await db.insert(honorContentLikes).values({ contentId: id, userId: user?.id || null, visitorKey: key, ipAddress: ip, userAgent: ua });
      }
    }

    const response = NextResponse.json(await getCounts(id, key));
    if (visitorId) {
      response.cookies.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    return response;
  } catch (err) {
    logger.error({ err, honorId: id }, "Honor engagement POST failed");
    return NextResponse.json({ error: "Engagement failed" }, { status: 500 });
  }
}
