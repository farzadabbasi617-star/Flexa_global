import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@/db";
import { telegramPreRegistrations, users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { normalizeDigits, normalizePhoneNumber } from "@/lib/phone";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const GAME_ALIASES: Record<string, string> = {
  "cod": "cod_mobile",
  "cod mobile": "cod_mobile",
  "cod_mobile": "cod_mobile",
  "call of duty": "cod_mobile",
  "call of duty mobile": "cod_mobile",
  "کالاف": "cod_mobile",
  "کالاف موبایل": "cod_mobile",
  "fortnite": "fortnite",
  "فورتنایت": "fortnite",
  "clash": "clash_royale",
  "clash royale": "clash_royale",
  "clash_royale": "clash_royale",
  "کلش": "clash_royale",
  "کلش رویال": "clash_royale",
};

function normalizeGame(value: string) {
  const normalized = normalizeDigits(value).trim().toLowerCase().replace(/-/g, "_");
  return GAME_ALIASES[normalized] || GAME_ALIASES[normalized.replace(/_/g, " ")] || normalized;
}

function normalizeFlexaId(value?: string | null) {
  const normalized = normalizeDigits(value || "").trim().toUpperCase().replace(/\s+/g, "");
  return normalized || null;
}

function safeText(value?: string | null, max = 255) {
  const trimmed = normalizeDigits(value || "").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function getProvidedSecret(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-flexa-telegram-secret")?.trim() || "";
}

function timingSafeEqualText(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function requireIntegrationSecret(request: NextRequest) {
  const configuredSecret = process.env.TELEGRAM_INTEGRATION_SECRET?.trim();
  if (!configuredSecret) {
    return { ok: false, status: 503, error: "Telegram integration is not configured" };
  }

  const providedSecret = getProvidedSecret(request);
  if (!providedSecret || !timingSafeEqualText(providedSecret, configuredSecret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true, status: 200, error: null };
}

const TelegramPreRegistrationSchema = z.object({
  telegramId: z.union([z.string(), z.number()]).transform((value) => String(value).trim()).pipe(z.string().min(3).max(32)),
  telegramUsername: z.string().max(100).optional().nullable(),
  telegramFirstName: z.string().max(100).optional().nullable(),
  telegramLastName: z.string().max(100).optional().nullable(),
  flexaId: z.string().max(20).optional().nullable(),
  fullName: z.string().trim().min(2).max(100),
  phoneNumber: z.string().trim().min(8).max(30),
  game: z.string().trim().min(2).max(50),
  platform: z.string().max(50).optional().nullable(),
  gamerTag: z.string().trim().min(2).max(100),
  city: z.string().max(100).optional().nullable(),
  teamName: z.string().max(100).optional().nullable(),
  status: z.enum(["new", "contacted", "converted", "archived"]).optional(),
  source: z.string().max(50).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = requireIntegrationSecret(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const validation = TelegramPreRegistrationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0]?.message || "Invalid payload" }, { status: 400 });
    }

    const payload = validation.data;
    const phoneNumber = normalizePhoneNumber(payload.phoneNumber);
    const flexaId = normalizeFlexaId(payload.flexaId);
    const game = normalizeGame(payload.game);

    const linkConditions = [];
    if (flexaId) linkConditions.push(eq(users.flexaId, flexaId));
    if (/^09\d{9}$/.test(phoneNumber)) linkConditions.push(eq(users.phoneNumber, phoneNumber));

    let linkedUserId: string | null = null;
    if (linkConditions.length > 0) {
      const [linkedUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(linkConditions.length === 1 ? linkConditions[0] : or(...linkConditions))
        .limit(1);
      linkedUserId = linkedUser?.id || null;
    }

    const values = {
      telegramId: payload.telegramId,
      telegramUsername: safeText(payload.telegramUsername, 100),
      telegramFirstName: safeText(payload.telegramFirstName, 100),
      telegramLastName: safeText(payload.telegramLastName, 100),
      linkedUserId,
      flexaId,
      fullName: safeText(payload.fullName, 100) || payload.fullName,
      phoneNumber,
      game,
      platform: safeText(payload.platform, 50),
      gamerTag: safeText(payload.gamerTag, 100) || payload.gamerTag,
      city: safeText(payload.city, 100),
      teamName: safeText(payload.teamName, 100),
      status: payload.status || "new",
      source: safeText(payload.source, 50) || "telegram_bot",
      rawPayload: body,
      updatedAt: new Date(),
    };

    const updateValues = { ...values };
    // If the bot simply re-syncs a lead, keep the admin-managed status
    // (contacted/converted/archived) instead of resetting it to "new".
    if (!payload.status) delete (updateValues as Partial<typeof values>).status;

    const [saved] = await db
      .insert(telegramPreRegistrations)
      .values(values)
      .onConflictDoUpdate({
        target: telegramPreRegistrations.telegramId,
        set: updateValues,
      })
      .returning();

    return NextResponse.json({ ok: true, preRegistration: saved }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "Telegram pre-registration integration failed");
    return NextResponse.json({ error: "Telegram pre-registration failed" }, { status: 500 });
  }
}
