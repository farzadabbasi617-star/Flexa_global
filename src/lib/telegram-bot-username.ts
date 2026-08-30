/**
 * Resolve the Telegram bot username used to build `t.me` deep links.
 *
 * Seven call sites used to inline `process.env.TELEGRAM_BOT_USERNAME || "..."`.
 * That only falls back when the variable is *empty*, so a placeholder value
 * sailed straight through: production had both TELEGRAM_BOT_USERNAME and
 * NEXT_PUBLIC_TELEGRAM_BOT_USERNAME set to the literal "YourBotUsername", and
 * the 1V1 button shipped `https://t.me/YourBotUsername?start=clash` — sending
 * players to a stranger's bot instead of Flexa's.
 *
 * This treats obvious placeholders as "unset" so a misconfigured environment
 * degrades to the correct bot rather than to a dead or hostile link.
 */

export const DEFAULT_TELEGRAM_BOT_USERNAME = "FlexaTournamentBot";

/** Values that mean "nobody filled this in", not a real username. */
const PLACEHOLDER_PATTERN =
  /^(your|my|the|a)?[-_]?bot([-_]?username)?$|^username$|^changeme$|^todo$|^xxx+$|^<.*>$|^bot[-_]?username$/i;

/**
 * Telegram usernames: 5-32 chars, letters/digits/underscore, and by convention
 * they end in "bot". Anything else is a typo or a template value.
 */
function isUsableBotUsername(value: string): boolean {
  if (!/^[A-Za-z0-9_]{5,32}$/.test(value)) return false;
  if (PLACEHOLDER_PATTERN.test(value)) return false;
  return true;
}

/**
 * @param raw Value from the environment. Pass the NEXT_PUBLIC_ variant on the
 *            client, since only that one is inlined into the browser bundle.
 */
export function resolveBotUsername(raw?: string | null): string {
  const trimmed = (raw || "").trim().replace(/^@/, "");
  return isUsableBotUsername(trimmed) ? trimmed : DEFAULT_TELEGRAM_BOT_USERNAME;
}

/** Server-side bot username (API routes, Telegram webhook, cron). */
export function serverBotUsername(): string {
  return resolveBotUsername(process.env.TELEGRAM_BOT_USERNAME);
}

/** Build a `t.me` deep link, optionally with a `?start=` payload. */
export function botDeepLink(startPayload?: string, username?: string): string {
  const bot = username ? resolveBotUsername(username) : serverBotUsername();
  return startPayload
    ? `https://t.me/${bot}?start=${encodeURIComponent(startPayload)}`
    : `https://t.me/${bot}`;
}
