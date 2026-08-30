import crypto from "crypto";
import type { NextRequest } from "next/server";

export interface WebhookSecretValidation {
  ok: boolean;
  status: number;
  error: string | null;
}

export function timingSafeEqualText(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function validateWebhookSecret(request: NextRequest): WebhookSecretValidation {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!configuredSecret) {
    return process.env.NODE_ENV === "production"
      ? { ok: false, status: 503, error: "Telegram webhook secret is not configured" }
      : { ok: true, status: 200, error: null };
  }

  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token")?.trim() || "";
  if (!providedSecret || !timingSafeEqualText(providedSecret, configuredSecret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, status: 200, error: null };
}
