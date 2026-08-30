import { arenaGameConfig, isOfficialInviteUrl } from "./arena-games";

/**
 * Whether a room is actually runnable, as opposed to merely well-formed.
 *
 * Publishing used to check only that the prize budget covered the maximum
 * liability. A room could therefore go live, take real entry fees, and reach its
 * start time with no room code, no password, no invite link and nobody assigned
 * to host it — leaving paid-up players with no way into the lobby.
 *
 * Blockers stop publication. Warnings are surfaced to the operator but do not
 * stop them, because some are legitimately deferred (a room code can be filled
 * in after registration opens, as long as it lands before the reveal time).
 */
export type CodReadinessLevel = "blocker" | "warning";

export interface CodReadinessIssue {
  key: string;
  level: CodReadinessLevel;
  message: string;
}

export interface CodRoomReadinessInput {
  game?: string;
  status: string;
  isPublished: boolean;
  roomCode?: string | null;
  roomPassword?: string | null;
  officialJoinUrl?: string | null;
  bannerImageUrl?: string | null;
  faq?: unknown;
  rules?: string | null;
  staffCount?: number;
  hasRoomer?: boolean;
  startsAt?: Date | string | null;
  credentialsRevealAt?: Date | string | null;
  entryFeeRial?: string | null;
  /** Placement/kill rules actually configured on the room. */
  hasAnyReward?: boolean;
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPaid(entryFeeRial: string | null | undefined) {
  try { return BigInt(entryFeeRial || "0") > BigInt(0); } catch { return false; }
}

export function evaluateCodRoomReadiness(input: CodRoomReadinessInput): CodReadinessIssue[] {
  const issues: CodReadinessIssue[] = [];
  const paid = isPaid(input.entryFeeRial);

  // A player can only join the lobby with a code+password or an official invite
  // link. Without either, the room cannot be played at all.
  const gameConfig = arenaGameConfig(input.game);
  const hasCode = Boolean(input.roomCode && String(input.roomCode).trim());
  const hasInvite = isOfficialInviteUrl(input.game, input.officialJoinUrl);
  if (!hasCode && !hasInvite) {
    issues.push({
      key: "credentials",
      level: paid ? "blocker" : "warning",
      // Fortnite rooms are entered with an Epic Custom Matchmaking Key and have
      // no invite-link form, so asking for one would be misleading.
      message: gameConfig.inviteLink
        ? `کد روم یا لینک رسمی دعوت ${gameConfig.label} وارد نشده؛ بدون آن هیچ بازیکنی نمی‌تواند وارد لابی شود.`
        : `کد روم (Custom Matchmaking Key) وارد نشده؛ بدون آن هیچ بازیکنی نمی‌تواند وارد لابی شود.`,
    });
  } else if (hasCode && !input.roomPassword) {
    issues.push({
      key: "password",
      level: "warning",
      message: "برای روم کد پسورد ثبت نشده است. اگر روم داخل بازی پسورد دارد حتماً واردش کن.",
    });
  }

  // Somebody has to create the lobby in-game and police it.
  if (!input.hasRoomer) {
    issues.push({
      key: "roomer",
      level: paid ? "blocker" : "warning",
      message: "هیچ Roomer به روم تخصیص داده نشده؛ کسی نیست که لابی را داخل بازی بسازد و مدیریت کند.",
    });
  }

  if (!input.hasAnyReward) {
    issues.push({
      key: "rewards",
      level: paid ? "blocker" : "warning",
      message: "هیچ جایزه‌ای تعریف نشده است؛ بازیکن ورودی می‌دهد ولی چیزی برای بردن وجود ندارد.",
    });
  }

  // Credentials must be revealed before the match starts, not after.
  const startsAt = toDate(input.startsAt);
  const revealAt = toDate(input.credentialsRevealAt);
  if (startsAt && revealAt && revealAt > startsAt) {
    issues.push({
      key: "reveal_after_start",
      level: "blocker",
      message: "زمان نمایش کد روم بعد از شروع بازی تنظیم شده است.",
    });
  }

  if (startsAt && startsAt.getTime() < Date.now()) {
    issues.push({
      key: "start_in_past",
      level: "blocker",
      message: "زمان شروع روم در گذشته است.",
    });
  }

  const faqCount = Array.isArray(input.faq) ? input.faq.length : 0;
  if (faqCount === 0) {
    issues.push({
      key: "faq",
      level: "warning",
      message: "سوالات پرتکرار خالی است؛ بازیکن جواب قوانین و نحوه پرداخت جایزه را پیدا نمی‌کند.",
    });
  }

  if (!input.rules || !String(input.rules).trim()) {
    issues.push({
      key: "rules",
      level: "warning",
      message: "متن قوانین روم خالی است.",
    });
  }

  if (!input.bannerImageUrl) {
    issues.push({
      key: "banner",
      level: "warning",
      message: "بنر روم انتخاب نشده؛ کارت روم در لیست بدون تصویر نمایش داده می‌شود.",
    });
  }

  return issues;
}

export function codReadinessBlockers(issues: CodReadinessIssue[]) {
  return issues.filter((issue) => issue.level === "blocker");
}

/** True when the room may be published. */
export function isCodRoomPublishable(input: CodRoomReadinessInput) {
  return codReadinessBlockers(evaluateCodRoomReadiness(input)).length === 0;
}
