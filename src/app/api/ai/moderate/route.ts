import { NextRequest, NextResponse } from "next/server";
import { moderateMessage } from "@/lib/ai-engine";
import { AIModerateSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { aiCache } from "@/lib/ai-cache";
import logger from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";


export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    
    // 1. Rate Limiting
    const rateLimitResult = await rateLimit(ip, 20, 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Moderation rate limit exceeded" }, { status: 429 });
    }

    const body = await request.json();
    
    // 2. Zod Validation
    const validation = AIModerateSchema.safeParse({ content: body.message });
    if (!validation.success) {
      return NextResponse.json({ 
        error: "Invalid content", 
        details: validation.error.issues 
      }, { status: 400 });
    }

    const content = body.message;

    // 3. Caching (Hash content)
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const cachedResult = aiCache.get(`moderate_${contentHash}`);
    if (cachedResult) {
      return NextResponse.json({ ...cachedResult, cached: true });
    }

    const result = moderateMessage(content);

    // Cache for 24 hours (Moderation results for same text rarely change)
    aiCache.set(`moderate_${contentHash}`, result, 86400);

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    logger.error({ err }, 'AI Moderation error');
    return NextResponse.json({ error: "Moderation error" }, { status: 500 });
  }
}
