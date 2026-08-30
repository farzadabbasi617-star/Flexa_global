import { normalizeClashRoyaleTag } from "@/lib/clash-royale-api";

export interface ParsedLeaderboardRow {
  rank: number;
  playerName: string;
  playerTag: string | null;
  score: number | null;
}

export function validateParsedLeaderboardRows(value: unknown, maxPlayers = 200): ParsedLeaderboardRow[] {
  const rawRows = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { rows?: unknown }).rows)
      ? (value as { rows: unknown[] }).rows
      : [];
  const ranks = new Set<number>();
  const rows: ParsedLeaderboardRow[] = [];

  for (const raw of rawRows.slice(0, Math.min(200, maxPlayers))) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const rank = Number(item.rank);
    const playerName = String(item.playerName || item.name || "").trim().slice(0, 100);
    if (!Number.isInteger(rank) || rank < 1 || rank > maxPlayers || ranks.has(rank) || !playerName) continue;
    const playerTag = normalizeClashRoyaleTag(String(item.playerTag || item.tag || ""));
    const rawScore = Number(item.score ?? item.points ?? NaN);
    rows.push({
      rank,
      playerName,
      playerTag,
      score: Number.isFinite(rawScore) ? Math.trunc(rawScore) : null,
    });
    ranks.add(rank);
  }
  return rows.sort((a, b) => a.rank - b.rank);
}
