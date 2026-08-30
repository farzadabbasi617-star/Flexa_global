import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { recordWebAffiliateVisit } from "@/lib/affiliate-service";
import {
  REFERRAL_CODE_COOKIE,
  REFERRAL_VISITOR_COOKIE,
  isValidInviteCode,
  normalizeInviteCode,
  publicOriginFromHeaders,
} from "@/lib/referral-invite";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30; // matches AFFILIATE_ATTRIBUTION_DAYS

/**
 * Web entry point for a referral link.
 *
 * Before this existed the only way to be attributed was opening a Telegram deep
 * link, so every invite shared on WhatsApp, Instagram or SMS was lost. This
 * records the click, pins the visitor with a first-party cookie and forwards to
 * signup. A failure here must never block the visitor: worst case they land on
 * the register page unattributed, which is exactly the old behaviour.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const code = normalizeInviteCode(rawCode);
  // Not request.nextUrl.origin: behind Render's proxy that is
  // https://localhost:10000 and every invite click would dead-end.
  const destination = new URL("/register", publicOriginFromHeaders(request.headers));

  if (!isValidInviteCode(code)) {
    return NextResponse.redirect(destination, { status: 307 });
  }

  destination.searchParams.set("ref", code);
  const response = NextResponse.redirect(destination, { status: 307 });

  try {
    const existingVisitor = request.cookies.get(REFERRAL_VISITOR_COOKIE)?.value;
    const visitorKey = existingVisitor && /^web:[a-f0-9-]{10,60}$/.test(existingVisitor)
      ? existingVisitor
      : `web:${crypto.randomUUID()}`;

    const result = await recordWebAffiliateVisit({
      visitorKey,
      referralCode: code,
      metadata: {
        userAgent: request.headers.get("user-agent")?.slice(0, 300) || null,
        referer: request.headers.get("referer")?.slice(0, 300) || null,
      },
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      maxAge: ATTRIBUTION_MAX_AGE,
      path: "/",
    };
    response.cookies.set(REFERRAL_VISITOR_COOKIE, visitorKey, cookieOptions);
    // Readable by the client so the register page can show who invited you.
    response.cookies.set(REFERRAL_CODE_COOKIE, code, { ...cookieOptions, httpOnly: false });

    logger.info({ code, attributed: result.attributed, reason: "reason" in result ? result.reason : null }, "Web referral link opened");
  } catch (error) {
    logger.warn({ error, code }, "Web referral attribution failed; forwarding to signup anyway");
  }

  return response;
}
