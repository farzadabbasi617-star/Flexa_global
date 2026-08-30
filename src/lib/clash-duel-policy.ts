import type { VerifiedClashBattle } from "@/lib/clash-royale-api";

export type ClashDuelOpponentType = "random" | "friend";
export type ClashDuelStakeMode = "free" | "paid";
export type ClashDuelGameMode = "normal" | "draft" | "triple_draft" | "sudden_death";

export const CLASH_DUEL_GAME_MODES: ReadonlyArray<{
  id: ClashDuelGameMode;
  label: string;
  shortLabel: string;
  emoji: string;
}> = [
  { id: "normal", label: "نبرد معمولی 1V1", shortLabel: "معمولی", emoji: "⚔️" },
  { id: "draft", label: "انتخاب کارت (Draft)", shortLabel: "انتخاب کارت", emoji: "🎴" },
  { id: "triple_draft", label: "انتخاب سه‌گانه (Triple Draft)", shortLabel: "Triple Draft", emoji: "🃏" },
  { id: "sudden_death", label: "مرگ ناگهانی (Sudden Death)", shortLabel: "Sudden Death", emoji: "⏱" },
] as const;

export function isClashDuelOpponentType(value: string): value is ClashDuelOpponentType {
  return value === "random" || value === "friend";
}

export function isClashDuelStakeMode(value: string): value is ClashDuelStakeMode {
  return value === "free" || value === "paid";
}

export function isClashDuelGameMode(value: string): value is ClashDuelGameMode {
  return CLASH_DUEL_GAME_MODES.some((mode) => mode.id === value);
}

export function clashDuelModeLabel(mode: ClashDuelGameMode | string) {
  return CLASH_DUEL_GAME_MODES.find((item) => item.id === mode)?.label || mode;
}

export function clashDuelStakeLabel(stake: ClashDuelStakeMode | string) {
  return stake === "paid" ? "پولی" : "رایگان";
}

export function clashDuelOpponentLabel(opponent: ClashDuelOpponentType | string) {
  return opponent === "friend" ? "بازی با دوست" : "حریف تصادفی";
}

function modeToken(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const MODE_ALIASES: Record<ClashDuelGameMode, string[]> = {
  normal: ["friendly", "normal", "1v1", "collection", "ladder"],
  draft: ["draft", "draftmode", "singledraft"],
  triple_draft: ["tripledraft", "tripledraftmode"],
  sudden_death: ["suddendeath", "suddendeathmode"],
};

/**
 * Supercell can expose the friendly mode through gameMode.name,
 * deckSelection, or battle.type depending on the selected mode/API version.
 */
export function clashBattleMatchesExpectedMode(expected: ClashDuelGameMode, battle: VerifiedClashBattle) {
  const candidates = [
    battle.gameMode,
    battle.battleType,
    battle.raw.gameMode?.name,
    battle.raw.deckSelection,
  ].map(modeToken).filter(Boolean);
  const aliases = MODE_ALIASES[expected];
  if (expected === "normal") {
    // A specific special-mode token must never be accepted as normal just
    // because the battle itself is also tagged as "friendly".
    const specialAliases = [
      ...MODE_ALIASES.draft,
      ...MODE_ALIASES.triple_draft,
      ...MODE_ALIASES.sudden_death,
    ];
    if (candidates.some((candidate) => specialAliases.includes(candidate))) return false;
  }
  return candidates.some((candidate) => aliases.includes(candidate));
}

export function challengeCanBeAccepted(input: {
  status: string;
  expiresAt: Date;
  challengerUserId: string;
  proposedByUserId: string;
  opponentUserId?: string | null;
  actorUserId: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  if (!["pending", "countered"].includes(input.status)) return { ok: false as const, reason: "closed" as const };
  if (input.expiresAt.getTime() <= now.getTime()) return { ok: false as const, reason: "expired" as const };
  if (input.proposedByUserId === input.actorUserId) return { ok: false as const, reason: "own_proposal" as const };
  if (input.actorUserId === input.challengerUserId && !input.opponentUserId) {
    return { ok: false as const, reason: "opponent_missing" as const };
  }
  if (input.opponentUserId && input.actorUserId !== input.opponentUserId && input.actorUserId !== input.challengerUserId) {
    return { ok: false as const, reason: "different_opponent" as const };
  }
  if (!input.opponentUserId && input.actorUserId === input.challengerUserId) {
    return { ok: false as const, reason: "same_user" as const };
  }
  return { ok: true as const };
}
