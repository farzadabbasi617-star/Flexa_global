export type MatchResultClaimValue = "win" | "lose";

export interface MatchResultClaimInput {
  playerId: string;
  claim: MatchResultClaimValue;
}

export type MatchResultResolution =
  | { state: "pending"; missingPlayerIds: string[] }
  | { state: "agreed"; winnerId: string; loserId: string }
  | { state: "conflict"; reason: "both_claimed_win" | "both_claimed_lose" };

/** Resolve two perspective-based claims without trusting submission order. */
export function resolveMatchResultClaims(
  player1Id: string,
  player2Id: string,
  claims: MatchResultClaimInput[],
): MatchResultResolution {
  const byPlayer = new Map(claims.map((claim) => [claim.playerId, claim.claim]));
  const player1Claim = byPlayer.get(player1Id);
  const player2Claim = byPlayer.get(player2Id);
  const missingPlayerIds = [
    ...(!player1Claim ? [player1Id] : []),
    ...(!player2Claim ? [player2Id] : []),
  ];
  if (missingPlayerIds.length > 0) return { state: "pending", missingPlayerIds };

  if (player1Claim === "win" && player2Claim === "lose") {
    return { state: "agreed", winnerId: player1Id, loserId: player2Id };
  }
  if (player1Claim === "lose" && player2Claim === "win") {
    return { state: "agreed", winnerId: player2Id, loserId: player1Id };
  }
  return {
    state: "conflict",
    reason: player1Claim === "win" ? "both_claimed_win" : "both_claimed_lose",
  };
}
