/**
 * Single-elimination bracket generation (pure logic, no DB).
 *
 * Extracted from the generate-brackets route so it can be unit-tested and
 * reused. Given an ordered list of player IDs, it produces every match for a
 * single-elimination tournament:
 *   - round 1 pairs players two-by-two; an odd player out gets a "bye"
 *     (an already-completed match they win automatically),
 *   - later rounds are created empty (player slots filled as winners advance).
 */

export interface GeneratedMatch {
  round: number;
  matchNumber: number;
  player1Id: string | null;
  player2Id: string | null;
  status: "pending" | "completed";
  winnerId: string | null;
}

export function generateSingleEliminationMatches(playerIds: string[]): GeneratedMatch[] {
  const numPlayers = playerIds.length;
  if (numPlayers < 2) return [];

  // Total rounds = ceil(log2(players)) rounded up to the next power of two.
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numPlayers)));
  const totalRounds = Math.ceil(Math.log2(nextPowerOf2));

  const firstRoundMatches = Math.ceil(numPlayers / 2);
  const matches: GeneratedMatch[] = [];

  // Round 1 — real pairings (with byes for an odd count).
  for (let i = 0; i < firstRoundMatches; i++) {
    const p1 = playerIds[i * 2] ?? null;
    const p2 = playerIds[i * 2 + 1] ?? null;
    matches.push({
      round: 1,
      matchNumber: i + 1,
      player1Id: p1,
      player2Id: p2,
      status: p2 ? "pending" : "completed",
      winnerId: !p2 ? p1 : null, // bye: lone player advances automatically
    });
  }

  // Subsequent rounds — empty placeholders.
  for (let round = 2; round <= totalRounds; round++) {
    const matchesInRound = Math.ceil(firstRoundMatches / Math.pow(2, round - 1));
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        round,
        matchNumber: i + 1,
        player1Id: null,
        player2Id: null,
        status: "pending",
        winnerId: null,
      });
    }
  }

  return matches;
}

/**
 * Fisher–Yates shuffle (returns a new array; does not mutate the input).
 * Accepts an optional RNG for deterministic tests.
 */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
