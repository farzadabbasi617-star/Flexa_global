import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { addCodRoomEvidence } from "@/lib/cod-room-service";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.enum(["profile", "scoreboard", "recording", "lobby_recording", "dispute"]),
  fileUrl: z.string().url().max(1500),
  contentHash: z.string().regex(/^[a-fA-F0-9]{64}$/).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "روم پیدا نشد" }, { status: 404 });
  try {
    const auth = await requireUser(request);
    if (!auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const limited = await rateLimit(`cod:evidence:${auth.user.id}:${id}`, 20, 60 * 60_000);
    if (!limited.success) return NextResponse.json({ error: "سقف ارسال مدرک پر شده است" }, { status: 429 });
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "مدرک معتبر نیست" }, { status: 400 });
    const created = await addCodRoomEvidence({
      roomId: id,
      userId: auth.user.id,
      isAdmin: auth.user.role === "admin" || auth.user.role === "super_admin",
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, evidence: created }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const known: Record<string, { text: string; status: number }> = {
      COD_ENTRY_NOT_FOUND: { text: "فقط شرکت‌کننده یا عوامل این روم می‌توانند مدرک بفرستند", status: 403 },
      COD_EVIDENCE_FORBIDDEN: { text: "رکورد کامل Lobby فقط توسط Roomer یا Spectator ثبت می‌شود", status: 403 },
      COD_EVIDENCE_DUPLICATE: { text: "این فایل قبلاً برای همین روم ثبت شده است", status: 409 },
      COD_EVIDENCE_URL_INVALID: { text: "لینک امن و معتبر مدرک وارد کن", status: 400 },
      COD_EVIDENCE_HASH_INVALID: { text: "هش فایل معتبر نیست", status: 400 },
    };
    if (known[code]) return NextResponse.json({ error: known[code].text, code }, { status: known[code].status });
    logger.error({ error, roomId: id }, "COD room evidence failed");
    return NextResponse.json({ error: "ثبت مدرک انجام نشد" }, { status: 500 });
  }
}
