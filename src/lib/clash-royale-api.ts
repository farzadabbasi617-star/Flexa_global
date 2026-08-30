import logger from "@/lib/logger";

const OFFICIAL_BASE_URL = "https://api.clashroyale.com/v1";
const PROXY_BASE_URL = "https://proxy.royaleapi.dev/v1";
const TAG_ALPHABET = /^[0289PYLQGRJCUV]{3,15}$/;

export interface ClashRoyaleApiConfiguration {
  configured: boolean;
  baseUrl: string;
  provider: "official" | "royaleapi_proxy" | "unsupported";
}

export interface ClashRoyalePlayer {
  tag: string;
  name: string;
  expLevel?: number;
  trophies?: number;
  bestTrophies?: number;
  wins?: number;
  losses?: number;
  battleCount?: number;
  threeCrownWins?: number;
  clan?: { tag?: string; name?: string };
  arena?: { id?: number; name?: string };
}

export interface ClashRoyaleBattleParticipant {
  tag: string;
  name?: string;
  crowns?: number;
  trophyChange?: number;
}

export interface ClashRoyaleBattle {
  type?: string;
  battleTime?: string;
  deckSelection?: string;
  gameMode?: { id?: number; name?: string };
  team?: ClashRoyaleBattleParticipant[];
  opponent?: ClashRoyaleBattleParticipant[];
}

export interface VerifiedClashBattle {
  battleTime: Date;
  battleType: string | null;
  gameMode: string | null;
  player1Tag: string;
  player2Tag: string;
  player1Crowns: number;
  player2Crowns: number;
  winnerTag: string | null;
  raw: ClashRoyaleBattle;
}

export class ClashRoyaleApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "ClashRoyaleApiError";
  }
}

export function normalizeClashRoyaleTag(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^#/, "")
    .replace(/\s+/g, "");
  return TAG_ALPHABET.test(normalized) ? `#${normalized}` : null;
}

export function encodeClashRoyaleTag(value: string) {
  const tag = normalizeClashRoyaleTag(value);
  if (!tag) throw new ClashRoyaleApiError("INVALID_PLAYER_TAG", 400, "invalidTag");
  return encodeURIComponent(tag);
}

export function parseClashBattleTime(value?: string | null) {
  const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d{3}))?Z$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, millis = "000"] = match;
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millis),
  ));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getClashRoyaleApiConfiguration(): ClashRoyaleApiConfiguration {
  const rawBaseUrl = (process.env.CLASH_ROYALE_API_BASE_URL || OFFICIAL_BASE_URL).trim().replace(/\/$/, "");
  const baseUrl = rawBaseUrl === PROXY_BASE_URL || rawBaseUrl === OFFICIAL_BASE_URL ? rawBaseUrl : rawBaseUrl;
  const provider = baseUrl === PROXY_BASE_URL
    ? "royaleapi_proxy"
    : baseUrl === OFFICIAL_BASE_URL
      ? "official"
      : "unsupported";
  return {
    configured: Boolean(process.env.CLASH_ROYALE_API_TOKEN?.trim()) && provider !== "unsupported",
    baseUrl,
    provider,
  };
}

interface ClashRoyaleClientOptions {
  token?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createClashRoyaleApiClient(options: ClashRoyaleClientOptions = {}) {
  const config = getClashRoyaleApiConfiguration();
  const token = (options.token ?? process.env.CLASH_ROYALE_API_TOKEN ?? "").trim();
  const baseUrl = (options.baseUrl ?? config.baseUrl).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.min(20_000, Math.max(2_000, options.timeoutMs ?? 10_000));

  async function request<T>(path: string): Promise<T> {
    if (!token) throw new ClashRoyaleApiError("CLASH_ROYALE_API_NOT_CONFIGURED", 503, "notConfigured");
    if (baseUrl !== OFFICIAL_BASE_URL && baseUrl !== PROXY_BASE_URL) {
      throw new ClashRoyaleApiError("CLASH_ROYALE_API_BASE_URL_NOT_ALLOWED", 503, "unsupportedBaseUrl");
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetchImpl(`${baseUrl}${path}`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "Flexa/1.0",
          },
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await response.text();
        let body: unknown = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }

        if (response.ok) return body as T;
        const apiBody = body as { reason?: string; message?: string } | null;
        const reason = apiBody?.reason || apiBody?.message || `HTTP_${response.status}`;
        const error = new ClashRoyaleApiError("CLASH_ROYALE_API_REQUEST_FAILED", response.status, reason);
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          lastError = error;
          continue;
        }
        throw error;
      } catch (error) {
        if (error instanceof ClashRoyaleApiError) throw error;
        lastError = error;
        if (attempt < 2) continue;
      }
    }
    logger.warn({ error: lastError, path }, "Clash Royale API network request failed");
    throw new ClashRoyaleApiError("CLASH_ROYALE_API_NETWORK_FAILED", 502, "networkError");
  }

  async function getPlayer(tag: string) {
    return request<ClashRoyalePlayer>(`/players/${encodeClashRoyaleTag(tag)}`);
  }

  async function getBattleLog(tag: string) {
    const result = await request<unknown>(`/players/${encodeClashRoyaleTag(tag)}/battlelog`);
    if (!Array.isArray(result)) throw new ClashRoyaleApiError("INVALID_BATTLE_LOG_RESPONSE", 502, "invalidResponse");
    return result as ClashRoyaleBattle[];
  }

  async function getTournament(tag: string) {
    return request<Record<string, unknown>>(`/tournaments/${encodeClashRoyaleTag(tag)}`);
  }

  return { getPlayer, getBattleLog, getTournament, request };
}

export function findHeadToHeadBattle(input: {
  battles: ClashRoyaleBattle[];
  player1Tag: string;
  player2Tag: string;
  notBefore?: Date | null;
}) {
  const player1Tag = normalizeClashRoyaleTag(input.player1Tag);
  const player2Tag = normalizeClashRoyaleTag(input.player2Tag);
  if (!player1Tag || !player2Tag) return null;
  const notBeforeMs = input.notBefore?.getTime() ?? 0;

  for (const battle of input.battles) {
    const battleTime = parseClashBattleTime(battle.battleTime);
    if (!battleTime || battleTime.getTime() < notBeforeMs) continue;
    const team = battle.team || [];
    const opponent = battle.opponent || [];
    const player1InTeam = team.find((player) => normalizeClashRoyaleTag(player.tag) === player1Tag);
    const player1InOpponent = opponent.find((player) => normalizeClashRoyaleTag(player.tag) === player1Tag);
    const player2InTeam = team.find((player) => normalizeClashRoyaleTag(player.tag) === player2Tag);
    const player2InOpponent = opponent.find((player) => normalizeClashRoyaleTag(player.tag) === player2Tag);
    const areOpponents = (player1InTeam && player2InOpponent) || (player1InOpponent && player2InTeam);
    if (!areOpponents) continue;

    const player1 = player1InTeam || player1InOpponent!;
    const player2 = player2InTeam || player2InOpponent!;
    const player1Crowns = Number(player1.crowns || 0);
    const player2Crowns = Number(player2.crowns || 0);
    return {
      battleTime,
      battleType: battle.type || null,
      gameMode: battle.gameMode?.name || battle.deckSelection || null,
      player1Tag,
      player2Tag,
      player1Crowns,
      player2Crowns,
      winnerTag: player1Crowns === player2Crowns
        ? null
        : player1Crowns > player2Crowns ? player1Tag : player2Tag,
      raw: battle,
    } satisfies VerifiedClashBattle;
  }
  return null;
}

export async function verifyClashRoyaleHeadToHead(input: {
  player1Tag: string;
  player2Tag: string;
  notBefore?: Date | null;
}) {
  const client = createClashRoyaleApiClient();
  const battles = await client.getBattleLog(input.player1Tag);
  return findHeadToHeadBattle({ ...input, battles });
}
