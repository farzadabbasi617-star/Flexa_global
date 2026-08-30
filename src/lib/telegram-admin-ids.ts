/**
 * Canonical parser for the TELEGRAM_ADMIN_IDS env var.
 *
 * This existed as three separate inline copies, and one of them used
 * `.filter((id) => Number.isFinite(Number(id)))`. Number("") is 0 and
 * Number.isFinite(0) is true, so an empty segment -- from an unset var, a
 * trailing comma, or "a,,b" -- survived the filter and was then sent through
 * Number(), producing chat_id 0. Telegram answers "chat not found", and the
 * outbox burned all five retry attempts on it every single night.
 *
 * One implementation, one set of tests, so the next copy cannot drift.
 */
export function parseTelegramAdminIds(raw: string | null | undefined): string[] {
  return String(raw || "")
    // Tolerate commas, semicolons and whitespace; operators paste all three.
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    // A Telegram chat id is a non-zero integer. Negative ids are groups and
    // channels, which are legitimate targets for an admin broadcast.
    .filter((value) => /^-?\d+$/.test(value) && Number(value) !== 0);
}

/** Admin ids from the environment, empty when none are configured. */
export function getTelegramAdminIdsFromEnv(): string[] {
  return parseTelegramAdminIds(process.env.TELEGRAM_ADMIN_IDS || process.env.ADMIN_IDS);
}
