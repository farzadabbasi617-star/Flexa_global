/**
 * Per-game configuration for the custom-room engine.
 *
 * The room engine (prizes, scaling, check-in, settlement, readiness) is already
 * game-agnostic; only a handful of details actually differ between titles. Rather
 * than fork ~1900 lines per game, those details live here and the engine reads
 * them by `game`.
 */
export const ARENA_GAMES = ["cod_mobile", "fortnite"] as const;
export type ArenaGame = (typeof ARENA_GAMES)[number];

export interface ArenaGameConfig {
  id: ArenaGame;
  label: string;
  /** Column prefix on `users` holding the player's in-game identity. */
  profileFields: { id: string; username: string; region?: string; status: string };
  regions: readonly string[];
  regionLabels: Record<string, string>;
  teamModes: readonly string[];
  teamSizes: Record<string, number>;
  /** Maps a team mode to how many players share one placement prize. */
  perspectives: readonly string[];
  maps: readonly string[];
  /** Hostname + path prefix an official invite link must match. */
  inviteLink: { hostname: string; pathPrefix: string } | null;
  /** Label for the in-game account level gate, or null when the game has none. */
  levelGateLabel: string | null;
  /** Whether a room is entered via a code, an invite link, or either. */
  entryMethods: readonly ("code" | "invite_link")[];
  defaults: { region: string; teamMode: string; perspective: string; map: string; capacity: number };
}

const COD_MOBILE: ArenaGameConfig = {
  id: "cod_mobile",
  label: "Call of Duty Mobile",
  profileFields: { id: "codMobileId", username: "codMobileUsername", region: "codMobileRegion", status: "codMobileStatus" },
  regions: ["global", "garena"],
  regionLabels: { global: "Global", garena: "Garena" },
  teamModes: ["solo", "duo", "squad"],
  teamSizes: { solo: 1, duo: 2, squad: 4 },
  perspectives: ["tpp", "fpp"],
  maps: ["isolated", "rebirth", "alcatraz", "blackout"],
  inviteLink: { hostname: "www.callofduty.com", pathPrefix: "/cdn/codm/teaminvite/" },
  levelGateLabel: "حداقل لول اکانت کالاف",
  entryMethods: ["code", "invite_link"],
  defaults: { region: "global", teamMode: "squad", perspective: "tpp", map: "isolated", capacity: 100 },
};

/**
 * Fortnite custom lobbies are gated behind an Epic-issued Custom Matchmaking
 * Key. The key is the room code: players enter it on the Fortnite lobby screen
 * before queueing, so there is no invite-link equivalent.
 *
 * Fortnite has no account-level gate comparable to COD's level 50 rule, so the
 * level field is suppressed rather than shown reading zero.
 */
const FORTNITE: ArenaGameConfig = {
  id: "fortnite",
  label: "Fortnite",
  profileFields: { id: "fortniteId", username: "fortniteUsername", status: "fortniteStatus" },
  regions: ["eu", "nae", "naw", "me", "asia", "oce", "brazil"],
  regionLabels: {
    eu: "Europe", nae: "NA East", naw: "NA West",
    me: "Middle East", asia: "Asia", oce: "Oceania", brazil: "Brazil",
  },
  teamModes: ["solo", "duo", "trio", "squad"],
  teamSizes: { solo: 1, duo: 2, trio: 3, squad: 4 },
  perspectives: ["tpp", "fpp"],
  maps: ["br_island", "reload", "zero_build", "creative"],
  inviteLink: null,
  levelGateLabel: null,
  entryMethods: ["code"],
  defaults: { region: "me", teamMode: "squad", perspective: "tpp", map: "br_island", capacity: 100 },
};

const CONFIGS: Record<ArenaGame, ArenaGameConfig> = {
  cod_mobile: COD_MOBILE,
  fortnite: FORTNITE,
};

export function isArenaGame(value: unknown): value is ArenaGame {
  return typeof value === "string" && (ARENA_GAMES as readonly string[]).includes(value);
}

/** Unknown games fall back to COD so existing rows keep working. */
export function arenaGameConfig(game: unknown): ArenaGameConfig {
  return isArenaGame(game) ? CONFIGS[game] : COD_MOBILE;
}

export function arenaTeamSize(game: unknown, teamMode: string) {
  return arenaGameConfig(game).teamSizes[teamMode] ?? 1;
}

/**
 * Validates an official invite link for the game, if it supports one.
 * Games without invite links reject every URL rather than silently accepting.
 */
export function isOfficialInviteUrl(game: unknown, value: unknown) {
  const config = arenaGameConfig(game);
  if (!config.inviteLink || !value) return false;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:"
      && url.hostname.toLowerCase() === config.inviteLink.hostname
      && url.pathname.startsWith(config.inviteLink.pathPrefix);
  } catch {
    return false;
  }
}

/** Persian label for a team mode, e.g. "۲۵ تیم ۴ نفره" or "۴۰ نفر". */
export function arenaCompositionLabel(game: unknown, teamMode: string, capacity: number) {
  const size = arenaTeamSize(game, teamMode);
  if (size <= 1) return `${capacity.toLocaleString("fa-IR")} نفر`;
  const teams = Math.floor(capacity / size);
  return `${teams.toLocaleString("fa-IR")} تیم ${size.toLocaleString("fa-IR")} نفره`;
}
