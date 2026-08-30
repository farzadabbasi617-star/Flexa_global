export const COD_REGIONS = ["global", "garena"] as const;
export const COD_BR_TEAM_MODES = ["solo", "duo", "squad"] as const;
export const COD_ROOM_STATUSES = [
  "draft",
  "registration",
  "check_in",
  "lobby_open",
  "in_progress",
  "settling",
  "completed",
  "cancelled",
] as const;
export const COD_PLACEMENT_PAYOUTS = ["per_team", "per_entry"] as const;

export type CodRegion = (typeof COD_REGIONS)[number];
export type CodBrTeamMode = (typeof COD_BR_TEAM_MODES)[number];
export type CodRoomStatus = (typeof COD_ROOM_STATUSES)[number];
export type CodPlacementPayout = (typeof COD_PLACEMENT_PAYOUTS)[number];

export interface CodPlacementRewardRule {
  from: number;
  to: number;
  amountRial: string;
}

/**
 * Diminishing per-kill payout, e.g. 1st kill 100k toman, 2nd 50k, 3rd 25k...
 * The infinite sum converges to `firstKillRial * divisor / (divisor - 1)`, which
 * is what makes this model safe to offer with a high headline number.
 */
export interface CodKillLadderConfig {
  firstKillRial: string;
  divisor: number;
  minKillRial: string;
}

export interface CodRewardConfig {
  perKillRial: string;
  participationRial: string;
  maxKillsPerEntry: number;
  /** Room-wide ceiling on scoring kills. 0 derives it from capacity * maxKillsPerEntry. */
  maxTotalKills: number;
  placementRules: CodPlacementRewardRule[];
  /**
   * `per_team` treats a placement amount as the prize for the whole squad and splits
   * it between the players that actually finished in that placement. `per_entry`
   * pays the full amount to every single player.
   */
  placementPayout: CodPlacementPayout;
  killLadder: CodKillLadderConfig | null;
}

export const DEFAULT_COD_REWARD_CONFIG: CodRewardConfig = {
  perKillRial: "0",
  participationRial: "0",
  maxKillsPerEntry: 40,
  maxTotalKills: 0,
  placementRules: [],
  placementPayout: "per_team",
  killLadder: null,
};

function nonNegativeMoney(value: unknown, field: string) {
  const normalized = String(value ?? "0").trim();
  if (!/^\d+$/.test(normalized)) throw new Error(`${field} باید عدد صحیح و غیرمنفی باشد`);
  return BigInt(normalized).toString();
}

function boundedInteger(value: unknown, min: number, max: number, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} باید بین ${min} و ${max} باشد`);
  }
  return parsed;
}

function normalizeKillLadder(input: unknown): CodKillLadderConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const firstKillRial = nonNegativeMoney(raw.firstKillRial, "جایزه اولین Kill");
  if (BigInt(firstKillRial) === BigInt(0)) return null;
  return {
    firstKillRial,
    divisor: boundedInteger(raw.divisor ?? 2, 2, 10, "ضریب کاهش نردبان Kill"),
    minKillRial: nonNegativeMoney(raw.minKillRial, "کف جایزه هر Kill"),
  };
}

export function normalizeCodRewardConfig(input: unknown): CodRewardConfig {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rulesInput = Array.isArray(raw.placementRules) ? raw.placementRules : [];
  const placementRules = rulesInput.map((item, index) => {
    const rule = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const from = boundedInteger(rule.from, 1, 100, `شروع جایگاه ${index + 1}`);
    const to = boundedInteger(rule.to ?? rule.from, from, 100, `پایان جایگاه ${index + 1}`);
    return {
      from,
      to,
      amountRial: nonNegativeMoney(rule.amountRial, `جایزه جایگاه ${index + 1}`),
    };
  }).sort((a, b) => a.from - b.from);

  for (let index = 1; index < placementRules.length; index += 1) {
    if (placementRules[index].from <= placementRules[index - 1].to) {
      throw new Error("بازه‌های جایزه جایگاه نباید هم‌پوشانی داشته باشند");
    }
  }

  const placementPayoutRaw = String(raw.placementPayout ?? "per_team");
  if (!(COD_PLACEMENT_PAYOUTS as readonly string[]).includes(placementPayoutRaw)) {
    throw new Error("نوع پرداخت جایزه جایگاه معتبر نیست");
  }

  return {
    perKillRial: nonNegativeMoney(raw.perKillRial, "جایزه هر Kill"),
    participationRial: nonNegativeMoney(raw.participationRial, "جایزه حضور"),
    maxKillsPerEntry: boundedInteger(raw.maxKillsPerEntry ?? 40, 1, 100, "سقف Kill"),
    maxTotalKills: boundedInteger(raw.maxTotalKills ?? 0, 0, 10_000, "سقف Kill کل روم"),
    placementRules,
    placementPayout: placementPayoutRaw as CodPlacementPayout,
    killLadder: normalizeKillLadder(raw.killLadder),
  };
}

/**
 * How much the room-wide kill budget has to shrink for a lobby that produced
 * more scoring kills than `maxTotalKills`.
 *
 * `maxTotalKills` was only ever read by the pre-publish estimate, so a room
 * advertising a 450,000 toman kill budget would happily pay 1,350,000 if the
 * lobby produced three times the expected kills. Settlement now applies the
 * same ceiling: recorded kills stay factual, the per-kill amount scales down.
 *
 * Returns basis points (10000 = no reduction).
 */
export function codKillBudgetScaleBps(maxTotalKills: number, recordedTotalKills: number) {
  const cap = Math.max(0, Math.floor(Number(maxTotalKills) || 0));
  const recorded = Math.max(0, Math.floor(Number(recordedTotalKills) || 0));
  if (cap <= 0 || recorded <= cap) return 10_000;
  return Math.floor((cap * 10_000) / recorded);
}

/** Total payout for `kills` kills under a halving ladder. */
export function codKillLadderTotalRial(ladder: CodKillLadderConfig, kills: number) {
  const first = BigInt(ladder.firstKillRial);
  const floorRial = BigInt(ladder.minKillRial);
  const divisor = BigInt(ladder.divisor);
  let current = first;
  let total = BigInt(0);
  for (let index = 0; index < kills; index += 1) {
    const payout = current > floorRial ? current : floorRial;
    total += payout;
    current = current / divisor;
  }
  return total;
}

function scaleRial(amountRial: string, scaleBps: number) {
  if (scaleBps >= 10_000) return BigInt(amountRial);
  return (BigInt(amountRial) * BigInt(scaleBps)) / BigInt(10_000);
}

function killRewardRial(config: CodRewardConfig, kills: number) {
  if (config.killLadder) return codKillLadderTotalRial(config.killLadder, kills);
  return BigInt(config.perKillRial) * BigInt(kills);
}

export function calculateCodEntryReward(
  configInput: unknown,
  killsInput: number,
  placementInput?: number | null,
  options: { placementSharers?: number; scaleBps?: number } = {},
) {
  const config = normalizeCodRewardConfig(configInput);
  const kills = boundedInteger(killsInput, 0, config.maxKillsPerEntry, "تعداد Kill");
  const placement = placementInput == null ? null : boundedInteger(placementInput, 1, 100, "جایگاه");
  // A partially filled room pays a proportionally smaller version of the same
  // prize table. 10000 bps (a full room, or a `fixed` room) is a no-op.
  const scaleBps = options.scaleBps == null
    ? 10_000
    : boundedInteger(options.scaleBps, 0, 10_000, "ضریب مقیاس جایزه");
  const scaledConfig: CodRewardConfig = scaleBps >= 10_000 ? config : {
    ...config,
    perKillRial: scaleRial(config.perKillRial, scaleBps).toString(),
    participationRial: scaleRial(config.participationRial, scaleBps).toString(),
    killLadder: config.killLadder ? {
      ...config.killLadder,
      firstKillRial: scaleRial(config.killLadder.firstKillRial, scaleBps).toString(),
      minKillRial: scaleRial(config.killLadder.minKillRial, scaleBps).toString(),
    } : null,
  };
  const killRewardTotal = killRewardRial(scaledConfig, kills);
  const placementRule = placement == null
    ? undefined
    : config.placementRules.find((rule) => placement >= rule.from && placement <= rule.to);
  const nominalPlacementRial = scaleRial(placementRule?.amountRial || "0", scaleBps);
  const sharers = config.placementPayout === "per_team"
    ? BigInt(Math.max(1, Math.floor(Number(options.placementSharers) || 1)))
    : BigInt(1);
  const placementRewardRial = nominalPlacementRial / sharers;
  const participationRewardRial = BigInt(scaledConfig.participationRial);
  return {
    kills,
    placement,
    scaleBps,
    killRewardRial: killRewardTotal,
    placementRewardRial,
    participationRewardRial,
    totalRewardRial: killRewardTotal + placementRewardRial + participationRewardRial,
  };
}

function teamSize(mode: string) {
  // Fortnite has trios; falling through to 1 would have priced a three-player
  // squad prize as if each player won it outright.
  if (mode === "duo") return 2;
  if (mode === "trio") return 3;
  if (mode === "squad") return 4;
  return 1;
}

/**
 * Worst-case kill spend for the room. A diminishing ladder pays the most when kills are
 * spread one-per-player (every kill is somebody's expensive first kill), so the ceiling is
 * the flattest legal distribution of the room-wide kill budget.
 */
export function estimateCodKillLiability(config: CodRewardConfig, capacity: number) {
  const perEntryCeiling = capacity * config.maxKillsPerEntry;
  const totalKills = config.maxTotalKills > 0
    ? Math.min(config.maxTotalKills, perEntryCeiling)
    : perEntryCeiling;
  if (!config.killLadder) return BigInt(config.perKillRial) * BigInt(totalKills);
  const base = Math.floor(totalKills / capacity);
  const remainder = totalKills % capacity;
  return codKillLadderTotalRial(config.killLadder, base + 1) * BigInt(remainder)
    + codKillLadderTotalRial(config.killLadder, base) * BigInt(capacity - remainder);
}

/** Conservative maximum liability used before an operator publishes a room. */
export function estimateCodRoomMaximumLiability(
  configInput: unknown,
  capacityInput: number,
  mode: CodBrTeamMode | string,
) {
  const config = normalizeCodRewardConfig(configInput);
  const capacity = boundedInteger(capacityInput, 2, 100, "ظرفیت روم");
  const killLiability = estimateCodKillLiability(config, capacity);
  const participationLiability = BigInt(config.participationRial) * BigInt(capacity);
  const membersPerPlacement = teamSize(mode);
  let placementLiability = BigInt(0);
  let rewardedEntries = 0;
  for (const rule of config.placementRules) {
    const available = Math.max(0, capacity - rewardedEntries);
    const positions = rule.to - rule.from + 1;
    const entries = Math.min(available, positions * membersPerPlacement);
    if (config.placementPayout === "per_team") {
      // The amount is the squad prize, so each rewarded squad costs it exactly once.
      const squads = Math.ceil(entries / membersPerPlacement);
      placementLiability += BigInt(rule.amountRial) * BigInt(squads);
    } else {
      placementLiability += BigInt(rule.amountRial) * BigInt(entries);
    }
    rewardedEntries += entries;
  }
  return killLiability + participationLiability + placementLiability;
}

/**
 * Structured match settings. Iranian Call of Duty rooms all publish the same
 * handful of lobby toggles, and burying them in free text means players cannot
 * filter on them and operators mistype them.
 */
export const COD_REVIVE_MODES = ["disabled", "enabled", "auto"] as const;
export const COD_ZONE_SPEEDS = ["slow", "normal", "fast"] as const;

export interface CodMatchSettings {
  revive: (typeof COD_REVIVE_MODES)[number] | null;
  limitedAmmo: boolean | null;
  zoneSpeed: (typeof COD_ZONE_SPEEDS)[number] | null;
  doubleGroundLoot: boolean | null;
  vehiclesEnabled: boolean | null;
}

export function normalizeCodMatchSettings(input: unknown): CodMatchSettings {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const enumOrNull = <T extends readonly string[]>(value: unknown, allowed: T) => {
    const normalized = String(value ?? "").trim();
    return (allowed as readonly string[]).includes(normalized) ? normalized as T[number] : null;
  };
  const boolOrNull = (value: unknown) => (typeof value === "boolean" ? value : null);
  return {
    revive: enumOrNull(raw.revive, COD_REVIVE_MODES),
    limitedAmmo: boolOrNull(raw.limitedAmmo),
    zoneSpeed: enumOrNull(raw.zoneSpeed, COD_ZONE_SPEEDS),
    doubleGroundLoot: boolOrNull(raw.doubleGroundLoot),
    vehiclesEnabled: boolOrNull(raw.vehiclesEnabled),
  };
}

export interface CodFaqEntry {
  question: string;
  answer: string;
}

export function normalizeCodFaq(input: unknown): CodFaqEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        question: String(entry.question ?? "").trim().slice(0, 200),
        answer: String(entry.answer ?? "").trim().slice(0, 4_000),
      };
    })
    .filter((entry) => entry.question.length > 0 && entry.answer.length > 0)
    .slice(0, 20);
}

/**
 * Room key art is rendered full-bleed at the top of the room page, so it must
 * not be an attacker-supplied `javascript:` or `data:` URL. Same-origin paths
 * (our own bundled art) and plain HTTPS URLs are the only things allowed.
 */
export function normalizeCodBannerUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(0, 500);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("فقط آدرس HTTPS برای بنر روم مجاز است");
    return url.toString().slice(0, 500);
  } catch (error) {
    if (error instanceof Error && error.message.includes("HTTPS")) throw error;
    throw new Error("آدرس بنر روم معتبر نیست");
  }
}

/**
 * How a room's advertised prize table behaves when the lobby does not fill.
 *
 * `fixed` honours the published amounts no matter how many players show up,
 * which is what a sponsored room wants but loses money on a quiet night: a
 * 100-seat room advertising 1,590,000 toman of prizes at a 23,000 toman entry
 * needs ~70 players just to break even.
 *
 * `scaled` keeps the same shape of prize table but scales every amount by how
 * full the room actually got, so the operator's margin is the same at 20
 * players as at 100. This is the default.
 */
export const COD_PRIZE_SCALING_MODES = ["scaled", "fixed"] as const;
export type CodPrizeScalingMode = (typeof COD_PRIZE_SCALING_MODES)[number];

export interface CodPrizeScalingConfig {
  mode: CodPrizeScalingMode;
  /**
   * Fill ratio, in basis points, at or above which the full advertised table is
   * paid. 10000 means "only a completely full room pays the headline amounts".
   */
  fullPayoutAtBps: number;
  /** Fill ratio below which the room is considered non-viable and is cancelled/refunded. */
  minimumViableBps: number;
}

export const DEFAULT_COD_PRIZE_SCALING: CodPrizeScalingConfig = {
  mode: "scaled",
  fullPayoutAtBps: 10_000,
  minimumViableBps: 2_500,
};

export function normalizeCodPrizeScaling(input: unknown): CodPrizeScalingConfig {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const mode = String(raw.mode ?? "scaled");
  if (!(COD_PRIZE_SCALING_MODES as readonly string[]).includes(mode)) {
    throw new Error("حالت مقیاس جایزه معتبر نیست");
  }
  const fullPayoutAtBps = boundedInteger(raw.fullPayoutAtBps ?? 10_000, 1_000, 10_000, "درصد تکمیل برای جایزه کامل");
  const minimumViableBps = boundedInteger(raw.minimumViableBps ?? 2_500, 0, 10_000, "حداقل درصد تکمیل");
  if (minimumViableBps > fullPayoutAtBps) {
    throw new Error("حداقل درصد تکمیل نمی‌تواند از درصد جایزه کامل بیشتر باشد");
  }
  return { mode: mode as CodPrizeScalingMode, fullPayoutAtBps, minimumViableBps };
}

/**
 * Fraction of the advertised prize table that a room with `registeredCount` of
 * `capacity` seats actually pays, expressed in basis points.
 */
export function codPrizeScaleBps(
  scaling: CodPrizeScalingConfig,
  registeredCount: number,
  capacity: number,
) {
  if (scaling.mode === "fixed") return 10_000;
  const seats = Math.max(1, Math.floor(capacity) || 1);
  const filled = Math.max(0, Math.min(seats, Math.floor(registeredCount) || 0));
  const fillBps = Math.floor((filled * 10_000) / seats);
  if (fillBps >= scaling.fullPayoutAtBps) return 10_000;
  // Scale linearly against the threshold, so hitting `fullPayoutAtBps` pays 100%.
  return Math.floor((fillBps * 10_000) / scaling.fullPayoutAtBps);
}

/**
 * The prize table as it stands right now, given how many players have joined.
 * This is what the room page shows so a player always sees the amount they
 * would actually be paid, not an aspirational headline.
 */
export function projectCodPrizeTable(input: {
  rewardConfig: unknown;
  scaling?: unknown;
  registeredCount: number;
  capacity: number;
  teamMode: CodBrTeamMode | string;
}) {
  const config = normalizeCodRewardConfig(input.rewardConfig);
  const scaling = normalizeCodPrizeScaling(input.scaling);
  const scaleBps = codPrizeScaleBps(scaling, input.registeredCount, input.capacity);
  const members = teamSize(input.teamMode);
  const seats = Math.max(1, Math.floor(input.capacity) || 1);
  const filled = Math.max(0, Math.min(seats, Math.floor(input.registeredCount) || 0));

  const meetsMinimum = Math.floor((filled * 10_000) / seats) >= scaling.minimumViableBps;

  const rows = config.placementRules.map((rule) => {
    const fullRial = BigInt(rule.amountRial);
    const currentRial = scaleRial(rule.amountRial, scaleBps);
    return {
      from: rule.from,
      to: rule.to,
      fullAmountRial: fullRial.toString(),
      currentAmountRial: currentRial.toString(),
      perPlayerRial: (config.placementPayout === "per_team" ? currentRial / BigInt(members) : currentRial).toString(),
    };
  });

  const totalCurrent = config.placementRules.reduce((sum, rule) => {
    const squads = rule.to - rule.from + 1;
    const perSquad = scaleRial(rule.amountRial, scaleBps);
    return sum + perSquad * BigInt(config.placementPayout === "per_team" ? squads : squads * members);
  }, BigInt(0));
  const totalFull = config.placementRules.reduce((sum, rule) => {
    const squads = rule.to - rule.from + 1;
    return sum + BigInt(rule.amountRial) * BigInt(config.placementPayout === "per_team" ? squads : squads * members);
  }, BigInt(0));

  return {
    mode: scaling.mode,
    scaleBps,
    /**
     * An empty room scales to zero, and a prize table reading "0 toman" is a
     * worse advert than the truth. Until the room is viable the headline
     * amounts are what we lead with, captioned as conditional on filling.
     */
    showHeadlineAmounts: !meetsMinimum,
    scalePercent: Math.round(scaleBps / 100),
    fillPercent: Math.round((filled / seats) * 100),
    registeredCount: filled,
    capacity: seats,
    isFullPayout: scaleBps >= 10_000,
    meetsMinimum,
    minimumPlayers: Math.ceil((scaling.minimumViableBps * seats) / 10_000),
    perKillCurrentRial: scaleRial(config.perKillRial, scaleBps).toString(),
    perKillFullRial: config.perKillRial,
    killLadderCurrent: config.killLadder ? {
      firstKillRial: scaleRial(config.killLadder.firstKillRial, scaleBps).toString(),
      divisor: config.killLadder.divisor,
      minKillRial: scaleRial(config.killLadder.minKillRial, scaleBps).toString(),
    } : null,
    rows,
    totalCurrentRial: totalCurrent.toString(),
    totalFullRial: totalFull.toString(),
  };
}

export function codReferralCommissionRial(serviceFeeRialInput: bigint, referralRateBpsInput: number) {
  const bps = boundedInteger(referralRateBpsInput, 0, 10_000, "درصد کمیسیون معرفی");
  if (serviceFeeRialInput <= BigInt(0) || bps === 0) return BigInt(0);
  return (serviceFeeRialInput * BigInt(bps)) / BigInt(10_000);
}

export function codRankTier(pointsInput: number) {
  const points = Math.max(0, Math.floor(Number(pointsInput) || 0));
  if (points >= 5_000) return "legend";
  if (points >= 3_000) return "ultra";
  if (points >= 1_800) return "pro";
  if (points >= 1_000) return "gold";
  if (points >= 500) return "silver";
  if (points >= 150) return "bronze";
  return "rookie";
}

export function codRankPointsForResult(killsInput: number, placementInput?: number | null) {
  const kills = Math.max(0, Math.min(100, Math.floor(Number(killsInput) || 0)));
  const placement = placementInput == null ? null : Math.max(1, Math.min(100, Math.floor(Number(placementInput) || 100)));
  const placementPoints = placement === 1 ? 120 : placement && placement <= 3 ? 80 : placement && placement <= 10 ? 35 : 0;
  return kills * 10 + placementPoints + 5;
}

const STATUS_TRANSITIONS: Record<CodRoomStatus, CodRoomStatus[]> = {
  draft: ["registration", "cancelled"],
  registration: ["check_in", "cancelled"],
  check_in: ["lobby_open", "cancelled"],
  lobby_open: ["in_progress", "cancelled"],
  in_progress: ["settling", "cancelled"],
  settling: ["completed", "in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionCodRoomStatus(from: CodRoomStatus, to: CodRoomStatus) {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}

export function isOfficialCodMobileInviteUrl(value: unknown) {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.hostname.toLowerCase() === "www.callofduty.com" && url.pathname.startsWith("/cdn/codm/teaminvite/");
  } catch {
    return false;
  }
}

export function shouldRevealCodRoomCredentials(input: {
  isAdmin: boolean;
  isRegistered: boolean;
  checkedIn: boolean;
  revealAt: Date | string | null;
  status: CodRoomStatus;
  now?: Date;
}) {
  if (input.isAdmin) return true;
  if (!input.isRegistered || !input.checkedIn) return false;
  if (["lobby_open", "in_progress", "settling", "completed"].includes(input.status)) return true;
  if (!input.revealAt) return false;
  const reveal = new Date(input.revealAt);
  return !Number.isNaN(reveal.getTime()) && (input.now || new Date()).getTime() >= reveal.getTime();
}
