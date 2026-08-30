import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateDailyGamingNews } from "@/lib/gaming-news-generator";
import { normalizeAIEnvValue } from "@/lib/ai-provider-manager";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const validSecrets = [
    process.env.HONORS_AI_SECRET,
    process.env.TELEGRAM_CRON_SECRET,
    process.env.CRON_SECRET,
  ].map(normalizeAIEnvValue).filter(Boolean);
  if (!validSecrets.length) return process.env.NODE_ENV !== "production";
  const provided = [
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "",
    request.nextUrl.searchParams.get("secret") || "",
    request.headers.get("x-flexa-ai-secret") || "",
  ].map((value) => normalizeAIEnvValue(value)).filter(Boolean);
  return provided.some((candidate) => validSecrets.some((secret) => {
    const left = Buffer.from(candidate);
    const right = Buffer.from(secret);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }));
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const force = request.nextUrl.searchParams.get("force") === "true";
    const result = await generateDailyGamingNews({ force });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    // Full diagnostics stay server-side. The response deliberately carries no
    // exception text, PostgreSQL error code, constraint detail or table name:
    // those describe the schema and belong in logs, not in a payload. The
    // caller is a cron job, so a stable generic failure is all it needs.
    logger.error({
      err: err?.message || err,
      stack: err?.stack,
      code: err?.code,
      detail: err?.detail,
      table: err?.table,
    }, "Auto honors news endpoint failed");

    return NextResponse.json({ error: "Auto news generation failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
