/**
 * The public Telegram channel, in one place.
 *
 * The literal "@Flexa_games" was hardcoded as a fallback in six modules and
 * printed directly on the contact page. That channel does not exist — Telegram
 * getChat returns "chat not found" — so the contact link was dead and the
 * admin /poll command silently failed. The real channel is @Flexa_games
 * (title: "Flexa"), which is what TELEGRAM_CHANNEL_URL points at.
 *
 * Deliberately dependency-free (no db, no logger) so client components can
 * import it too. Server code should keep using getTelegramChannelChatId() from
 * `telegram.ts`, which layers TELEGRAM_CHANNEL_ID on top of this.
 */

/** Verified against Telegram getChat; do not "correct" this to Flexa_games. */
export const DEFAULT_TELEGRAM_CHANNEL_USERNAME = "Flexa_games";

function usernameFrom(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const fromUrl = raw.match(/(?:https?:\/\/)?(?:www\.)?t\.me\/([A-Za-z0-9_]{4,32})/i)?.[1];
  if (fromUrl) return fromUrl;
  const bare = raw.replace(/^@/, "");
  return /^[A-Za-z0-9_]{4,32}$/.test(bare) ? bare : null;
}

/**
 * @param raw Pass NEXT_PUBLIC_TELEGRAM_CHANNEL_URL on the client; only
 *            NEXT_PUBLIC_* variables are inlined into the browser bundle.
 */
export function resolveChannelUsername(raw?: string | null): string {
  return usernameFrom(raw) || DEFAULT_TELEGRAM_CHANNEL_USERNAME;
}

/** Display handle, e.g. "@Flexa_games". */
export function channelHandle(raw?: string | null): string {
  return `@${resolveChannelUsername(raw)}`;
}

/** Public URL, e.g. "https://t.me/Flexa_games". */
export function channelUrl(raw?: string | null): string {
  return `https://t.me/${resolveChannelUsername(raw)}`;
}
