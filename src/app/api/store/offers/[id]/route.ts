import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { StoreOfferActionSchema } from "@/lib/validations";
import { respondToOffer, StoreError } from "@/lib/store-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

// PATCH: respond to an offer — seller accepts/rejects, or buyer withdraws.
//   Body: { action: "accept" | "reject" | "withdraw" }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error, status } = await requireUser(request);
    if (!user) return NextResponse.json({ error }, { status });
    const { id } = await params;

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const limit = await rateLimit(`store:offer:respond:${user.id}:${ip}`, 40, 60 * 1000);
    if (!limit.success) {
      return NextResponse.json({ error: "تعداد درخواست‌ها زیاد است." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = StoreOfferActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "اطلاعات نامعتبر" }, { status: 400 });
    }

    const result = await respondToOffer({
      offerId: id,
      actorId: user.id,
      action: parsed.data.action,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StoreError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    logger.error({ err }, "Store offer PATCH error");
    return NextResponse.json({ error: "خطا در پاسخ به پیشنهاد" }, { status: 500 });
  }
}
