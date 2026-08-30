import { describe, expect, it } from "vitest";
import { resolveMatchResultClaims } from "@/lib/match-result-policy";

describe("match result claim resolution", () => {
  it("waits until both players report", () => {
    expect(resolveMatchResultClaims("p1", "p2", [{ playerId: "p1", claim: "win" }]))
      .toEqual({ state: "pending", missingPlayerIds: ["p2"] });
  });

  it("resolves complementary win/loss claims regardless of winner side", () => {
    expect(resolveMatchResultClaims("p1", "p2", [
      { playerId: "p1", claim: "win" },
      { playerId: "p2", claim: "lose" },
    ])).toEqual({ state: "agreed", winnerId: "p1", loserId: "p2" });

    expect(resolveMatchResultClaims("p1", "p2", [
      { playerId: "p1", claim: "lose" },
      { playerId: "p2", claim: "win" },
    ])).toEqual({ state: "agreed", winnerId: "p2", loserId: "p1" });
  });

  it("routes conflicting claims to judgment", () => {
    expect(resolveMatchResultClaims("p1", "p2", [
      { playerId: "p1", claim: "win" },
      { playerId: "p2", claim: "win" },
    ])).toEqual({ state: "conflict", reason: "both_claimed_win" });

    expect(resolveMatchResultClaims("p1", "p2", [
      { playerId: "p1", claim: "lose" },
      { playerId: "p2", claim: "lose" },
    ])).toEqual({ state: "conflict", reason: "both_claimed_lose" });
  });
});
