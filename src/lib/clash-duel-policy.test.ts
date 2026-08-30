import { describe, expect, it } from "vitest";
import { challengeCanBeAccepted, clashBattleMatchesExpectedMode } from "./clash-duel-policy";
import type { VerifiedClashBattle } from "./clash-royale-api";

function battle(gameMode: string | null, deckSelection?: string): VerifiedClashBattle {
  return {
    battleTime: new Date(),
    battleType: "friendly",
    gameMode,
    player1Tag: "#P0Y",
    player2Tag: "#P2Y",
    player1Crowns: 1,
    player2Crowns: 0,
    winnerTag: "#P0Y",
    raw: { type: "friendly", gameMode: gameMode ? { name: gameMode } : undefined, deckSelection },
  };
}

describe("Clash duel mode policy", () => {
  it("distinguishes card draft and triple draft from normal friendly battles", () => {
    expect(clashBattleMatchesExpectedMode("draft", battle("Friendly", "Draft"))).toBe(true);
    expect(clashBattleMatchesExpectedMode("normal", battle("Friendly", "Draft"))).toBe(false);
    expect(clashBattleMatchesExpectedMode("triple_draft", battle("TripleDraft"))).toBe(true);
    expect(clashBattleMatchesExpectedMode("draft", battle("TripleDraft"))).toBe(false);
  });

  it("accepts normal and sudden-death aliases", () => {
    expect(clashBattleMatchesExpectedMode("normal", battle("Friendly", "Collection"))).toBe(true);
    expect(clashBattleMatchesExpectedMode("sudden_death", battle("SuddenDeath"))).toBe(true);
  });

  it("does not let the proposer accept their own mode proposal", () => {
    const now = new Date("2026-07-19T10:00:00Z");
    expect(challengeCanBeAccepted({
      status: "pending",
      expiresAt: new Date("2026-07-19T10:15:00Z"),
      challengerUserId: "challenger",
      proposedByUserId: "challenger",
      actorUserId: "challenger",
      now,
    })).toEqual({ ok: false, reason: "own_proposal" });
  });

  it("allows the invited opponent to accept a live proposal", () => {
    const result = challengeCanBeAccepted({
      status: "pending",
      expiresAt: new Date("2026-07-19T10:15:00Z"),
      challengerUserId: "challenger",
      proposedByUserId: "challenger",
      actorUserId: "friend",
      now: new Date("2026-07-19T10:00:00Z"),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects expired and intercepted bound invitations", () => {
    expect(challengeCanBeAccepted({
      status: "pending",
      expiresAt: new Date("2026-07-19T09:59:00Z"),
      challengerUserId: "challenger",
      proposedByUserId: "challenger",
      actorUserId: "friend",
      now: new Date("2026-07-19T10:00:00Z"),
    })).toEqual({ ok: false, reason: "expired" });
    expect(challengeCanBeAccepted({
      status: "countered",
      expiresAt: new Date("2026-07-19T10:15:00Z"),
      challengerUserId: "challenger",
      proposedByUserId: "friend",
      opponentUserId: "friend",
      actorUserId: "intruder",
      now: new Date("2026-07-19T10:00:00Z"),
    })).toEqual({ ok: false, reason: "different_opponent" });
  });
});
