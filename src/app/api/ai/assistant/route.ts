import { NextRequest, NextResponse } from "next/server";
import { generateRealAssistantResponse } from "@/lib/ai-service";
import { AIAssistantSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";
import { validateSession } from "@/lib/auth";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const ua = request.headers.get("user-agent") || "unknown";
    const token = request.cookies.get("session")?.value || "";
    const user = token ? await validateSession(token, ip, ua, request) : null;

    const limitKey = user ? `ai-assistant:user:${user.id}` : `ai-assistant:ip:${ip}`;
    const limit = await rateLimit(limitKey, user ? 20 : 8, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json(
        { error: "تعداد درخواست‌های دستیار زیاد است. لطفاً کمی بعد دوباره امتحان کنید." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const validation = AIAssistantSchema.safeParse({ message: body.message });
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0]?.message || "پیام معتبر نیست" }, { status: 400 });
    }

    const response = await generateRealAssistantResponse(validation.data.message, {
      lang: "fa",
      userName: user?.displayName || undefined,
    });

    return NextResponse.json({
      response: response.response,
      suggestions: response.suggestions,
      provider: response.provider,
      cachedProvider: response.cachedProvider || null,
    });
  } catch (err) {
    logger.error({ err }, "AI assistant route failed");
    return NextResponse.json({ error: "دستیار هوشمند فعلاً در دسترس نیست" }, { status: 500 });
  }
}
