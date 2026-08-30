export const MAX_TELEGRAM_UPDATE_ATTEMPTS = 5;

export function telegramRetryDelaySeconds(attempts: number) {
  const safeAttempts = Math.max(1, Math.floor(attempts));
  return Math.min(60 * 60, 5 * 2 ** (safeAttempts - 1));
}

export function shouldRetryTelegramUpdate(attempts: number, degraded = false) {
  return !degraded && attempts < MAX_TELEGRAM_UPDATE_ATTEMPTS;
}
