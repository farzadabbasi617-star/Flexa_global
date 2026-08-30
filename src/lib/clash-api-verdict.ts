/**
 * API-first result verification for Clash Royale 1V1.
 *
 * The old flow asked each player to self-report ("✅ بردم" / "❌ باختم") and only
 * consulted the Battle Log once the two reports happened to agree. That is
 * backwards when an authoritative source exists:
 *
 *  - It invites lying. Live data shows 3 `win` claims against 1 `lose`.
 *  - Two honest players who both misremember, or one who never answers, park
 *    the match in `awaiting_judgment` forever (there is one such row in prod).
 *  - The winner is already unambiguous in the Battle Log via crown count, so
 *    the claims add no information -- only a way to disagree.
 *
 * Now a single "🔍 بررسی نتیجه" button reads the Battle Log and decides. Claims
 * are gone; the dispute button stays, because the API can be right about the
 * crowns and still wrong about fairness (deck rules, a mis-hosted mode, a
 * connection abuse) and that judgment is human.
 */

export type ClashVerdictState =
  /** The Battle Log has not surfaced this match yet. Retry later. */
  | "pending_api"
  /** Battle found, one side had more crowns. Safe to finalise. */
  | "decided"
  /** Battle found, crowns level. Needs a human. */
  | "draw"
  /** Battle found but the mode is not the one the room mandated. */
  | "mode_mismatch"
  /** One or both players have no verified Player Tag. */
  | "missing_tags"
  /** The Clash API is unreachable or unconfigured. */
  | "api_error";

export interface ClashVerdict {
  state: ClashVerdictState;
  winnerTag?: string | null;
  loserTag?: string | null;
  player1Crowns?: number;
  player2Crowns?: number;
  battleTime?: string;
  reason?: string;
}

export interface ClashVerdictBattle {
  battleTime: Date;
  winnerTag: string | null;
  player1Tag: string;
  player2Tag: string;
  player1Crowns: number;
  player2Crowns: number;
}

/**
 * Turns a Battle Log lookup into a verdict.
 *
 * Deliberately pure: no database, no network, no Telegram. Every branch that
 * decides who gets paid is therefore testable without mocks.
 */
export function decideClashVerdict(input: {
  battle: ClashVerdictBattle | null;
  player1Tag: string | null;
  player2Tag: string | null;
  apiConfigured: boolean;
  modeMatches?: boolean;
}): ClashVerdict {
  if (!input.apiConfigured) return { state: "api_error", reason: "not_configured" };
  if (!input.player1Tag || !input.player2Tag) return { state: "missing_tags" };
  if (!input.battle) return { state: "pending_api" };

  const battle = input.battle;
  const common = {
    player1Crowns: battle.player1Crowns,
    player2Crowns: battle.player2Crowns,
    battleTime: battle.battleTime.toISOString(),
  };

  // Mode is checked before the winner: a match played in the wrong mode is void
  // regardless of who won it.
  if (input.modeMatches === false) return { state: "mode_mismatch", ...common };

  if (!battle.winnerTag || battle.player1Crowns === battle.player2Crowns) {
    return { state: "draw", ...common };
  }

  const winnerTag = battle.winnerTag;
  const loserTag = winnerTag === battle.player1Tag ? battle.player2Tag : battle.player1Tag;
  return { state: "decided", winnerTag, loserTag, ...common };
}

/**
 * Retry schedule for a Battle Log that has not appeared yet.
 *
 * Supercell's API lags a finished battle by a minute or two, so the first press
 * of the button very often lands on `pending_api`. Rather than making the
 * player poll by hand, the bot retries on this back-off and reports when it
 * resolves. Delays are in milliseconds from the moment the button was pressed.
 */
export const CLASH_VERDICT_RETRY_DELAYS_MS = [60_000, 120_000, 180_000, 300_000] as const;

/** Total window the automatic retries cover. */
export const CLASH_VERDICT_RETRY_WINDOW_MS =
  CLASH_VERDICT_RETRY_DELAYS_MS[CLASH_VERDICT_RETRY_DELAYS_MS.length - 1];

/** The next automatic attempt after `attempt` failed, or null when exhausted. */
export function nextClashVerdictRetryDelayMs(attempt: number) {
  const index = Math.max(0, Math.floor(attempt));
  return index < CLASH_VERDICT_RETRY_DELAYS_MS.length ? CLASH_VERDICT_RETRY_DELAYS_MS[index] : null;
}

/** Whether a verdict is worth retrying, or is as final as the API can make it. */
export function isRetryableClashVerdict(state: ClashVerdictState) {
  return state === "pending_api" || state === "api_error";
}

const MESSAGES: Record<ClashVerdictState, string> = {
  decided: "✅ نتیجه از Battle Log تأیید شد.",
  draw: "🤝 Battle Log تساوی نشان می‌دهد (تعداد تاج‌ها برابر است). این مسابقه برای داوری ارسال شد.",
  mode_mismatch: "🚨 مود بازی با مود اعلام‌شده مسابقه یکی نیست. برای داوری ارسال شد.",
  missing_tags: "برای بررسی خودکار نتیجه، هر دو بازیکن باید Player Tag کلش رویال را در پروفایل ثبت کرده باشند.",
  pending_api: "⏳ Battle Log هنوز در سرور کلش رویال ثبت نشده. سیستم خودش تا چند دقیقه دیگر دوباره بررسی می‌کند.",
  api_error: "⚠️ ارتباط با سرور کلش رویال برقرار نشد. سیستم خودش دوباره تلاش می‌کند.",
};

export function clashVerdictMessage(state: ClashVerdictState) {
  return MESSAGES[state];
}
