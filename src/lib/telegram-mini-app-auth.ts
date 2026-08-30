import { parse, validate } from "@tma.js/init-data-node";

export interface TelegramMiniAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  [key: string]: unknown;
}

const DEFAULT_INIT_DATA_TTL_SECONDS = 60 * 60;

export function telegramInitDataTtlSeconds(): number {
  const configured = Number(process.env.TELEGRAM_INIT_DATA_TTL_SECONDS || DEFAULT_INIT_DATA_TTL_SECONDS);
  if (!Number.isFinite(configured)) return DEFAULT_INIT_DATA_TTL_SECONDS;
  // Keep accidental configuration from making replay protection useless or
  // making normal Mini App launches expire immediately.
  return Math.min(24 * 60 * 60, Math.max(60, Math.floor(configured)));
}

/**
 * Validate Telegram Mini App initData and return its trusted user.
 *
 * The upstream MIT-licensed validator performs signature verification with a
 * timing-safe implementation and enforces auth_date expiry, preventing replay
 * of an old, once-valid Mini App login payload.
 */
export function validateTelegramMiniAppInitData(
  initData: string,
  botToken: string,
  expiresIn = telegramInitDataTtlSeconds()
): TelegramMiniAppUser {
  validate(initData, botToken, { expiresIn });
  const parsed = parse(initData);
  const user = parsed.user as TelegramMiniAppUser | undefined;

  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new Error("TELEGRAM_INIT_DATA_USER_MISSING");
  }

  return user;
}
