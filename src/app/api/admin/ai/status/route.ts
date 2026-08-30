import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { fetchAIResponse, isUsableAISecret, normalizeAIEnvValue } from "@/lib/ai-provider-manager";
import { rateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdminPermission(request, "ai");
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const openrouterKey = normalizeAIEnvValue(process.env.OPENROUTER_API_KEY);
  const groqKey = normalizeAIEnvValue(process.env.GROQ_API_KEY);

  // This is a health check that spends real money: every call performs a live
  // completion against OpenRouter/Groq. An admin leaving the panel open, a
  // refresh loop, or a polling dashboard would bill on each hit. Cap it per
  // admin and degrade gracefully — the configuration flags below are still
  // accurate without a live probe.
  const probe = await rateLimit(`admin-ai-status:${auth.user.id}`, 6, 60 * 1000);
  const test = probe.success
    ? await fetchAIResponse("در یک جمله بگو Flexa AI فعال است.", "فقط فارسی و خیلی کوتاه پاسخ بده.")
    : null;

  return NextResponse.json({
    configured: {
      openrouter: isUsableAISecret(openrouterKey),
      groq: isUsableAISecret(groqKey),
    },
    // Helps diagnose pasted quotes without exposing the secret.
    normalized: {
      openrouterHadWrappingQuotes: Boolean(process.env.OPENROUTER_API_KEY?.trim().startsWith('"')),
      groqHadWrappingQuotes: Boolean(process.env.GROQ_API_KEY?.trim().startsWith('"')),
    },
    // Distinguish "the probe ran and failed" from "the probe was skipped to
    // avoid burning credits" — otherwise a throttled check looks like an
    // outage.
    probeSkipped: !probe.success,
    connected: probe.success ? Boolean(test) : null,
    provider: test?.provider || (probe.success ? "local" : null),
    cachedProvider: test?.cachedProvider || null,
    model: test?.model || null,
    sample: test?.content || null,
  });
}
