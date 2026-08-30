import { describe, it, expect } from "vitest";
import {
  analyzeMatch,
  moderateMessage,
  analyzePlayer,
  generateAssistantResponse,
} from "@/lib/ai-engine";

const evenHistory = { wins: 10, losses: 10 };

describe("analyzeMatch — verdict", () => {
  it("declares player 1 the winner when they score higher", () => {
    const r = analyzeMatch(10, 3, 1200, 1200, evenHistory, evenHistory, true);
    expect(r.verdict).toBe("player1_wins");
  });

  it("declares player 2 the winner when they score higher", () => {
    const r = analyzeMatch(2, 9, 1200, 1200, evenHistory, evenHistory, true);
    expect(r.verdict).toBe("player2_wins");
  });

  it("returns a draw on equal scores (not a rematch)", () => {
    const r = analyzeMatch(5, 5, 1200, 1200, evenHistory, evenHistory, true);
    expect(r.verdict).toBe("draw");
  });

  it("does NOT send a clean decisive win to rematch", () => {
    const r = analyzeMatch(10, 0, 1500, 1000, evenHistory, evenHistory, true);
    expect(r.verdict).toBe("player1_wins");
    expect(r.verdict).not.toBe("rematch");
  });
});

describe("analyzeMatch — confidence (regression for the inverted-confidence bug)", () => {
  it("gives higher confidence to clearer (bigger-gap) wins", () => {
    const close = analyzeMatch(6, 5, 1200, 1200, evenHistory, evenHistory, true);
    const clear = analyzeMatch(10, 0, 1200, 1200, evenHistory, evenHistory, true);
    // A blowout must be at least as certain as a one-point win — previously
    // the fairness factor made it LOWER, which was the bug.
    expect(clear.confidence).toBeGreaterThan(close.confidence);
  });

  it("confidence rises monotonically with score gap", () => {
    const c1 = analyzeMatch(1, 0, 1300, 1200, evenHistory, evenHistory, true).confidence;
    const c5 = analyzeMatch(5, 0, 1300, 1200, evenHistory, evenHistory, true).confidence;
    const c10 = analyzeMatch(10, 0, 1300, 1200, evenHistory, evenHistory, true).confidence;
    expect(c5).toBeGreaterThan(c1);
    expect(c10).toBeGreaterThan(c5);
  });

  it("evidence increases confidence, all else equal", () => {
    const withEv = analyzeMatch(8, 2, 1200, 1200, evenHistory, evenHistory, true).confidence;
    const without = analyzeMatch(8, 2, 1200, 1200, evenHistory, evenHistory, false).confidence;
    expect(withEv).toBeGreaterThan(without);
  });

  it("keeps confidence within 0..100", () => {
    const r = analyzeMatch(50, 0, 3000, 0, { wins: 99, losses: 0 }, { wins: 0, losses: 99 }, true);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
  });
});

describe("analyzeMatch — suspicion", () => {
  it("flags a big upset with no evidence as suspicious", () => {
    // Low-rated player wins decisively, no evidence -> should raise suspicion.
    const r = analyzeMatch(18, 0, 1000, 1600, { wins: 2, losses: 20 }, { wins: 20, losses: 2 }, false);
    expect(r.suspicionLevel).toBeGreaterThanOrEqual(50);
  });

  it("keeps suspicion low for an expected, evidenced result", () => {
    const r = analyzeMatch(8, 4, 1500, 1000, { wins: 20, losses: 5 }, { wins: 5, losses: 20 }, true);
    expect(r.suspicionLevel).toBeLessThan(30);
  });

  it("sends very high suspicion to needs_review", () => {
    const r = analyzeMatch(20, 0, 800, 1800, { wins: 1, losses: 30 }, { wins: 30, losses: 1 }, false);
    expect(r.suspicionLevel).toBeGreaterThan(50);
    // With suspicion over the high threshold the verdict should be a review.
    if (r.suspicionLevel > 80) expect(r.verdict).toBe("needs_review");
  });
});

describe("moderateMessage", () => {
  it("allows a normal friendly message", () => {
    const r = moderateMessage("good game, well played!");
    expect(r.isAllowed).toBe(true);
    expect(r.toxicityScore).toBeLessThan(70);
  });

  it("blocks toxic English language", () => {
    const r = moderateMessage("you are an idiot and a loser");
    expect(r.categories).toContain("toxic_language");
    expect(r.isAllowed).toBe(false);
  });

  it("blocks normalized Persian profanity", () => {
    const r = moderateMessage("واقعاً بی‌شعور هستی");
    expect(r.categories).toContain("persian_profanity");
    expect(r.isAllowed).toBe(false);
  });

  it("does not treat a normal cheating report as profanity", () => {
    const r = moderateMessage("یک نفر از cheat استفاده کرده، لطفاً بررسی کنید");
    expect(r.categories).toContain("cheating_reference");
    expect(r.categories).not.toContain("toxic_language");
    expect(r.isAllowed).toBe(true);
  });

  it("flags spam (repeated characters)", () => {
    const r = moderateMessage("aaaaaaaaaaaaaaaa");
    expect(r.categories).toContain("spam");
  });

  it("never returns a toxicity score outside 0..100", () => {
    const r = moderateMessage("FUCK THIS STUPID HACK ".repeat(40));
    expect(r.toxicityScore).toBeGreaterThanOrEqual(0);
    expect(r.toxicityScore).toBeLessThanOrEqual(100);
  });
});

describe("analyzePlayer", () => {
  it("assigns a higher skill tier to higher-rated players", () => {
    const bronze = analyzePlayer(700, 2, 8, []);
    const legend = analyzePlayer(1700, 90, 10, []);
    const order = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Legend"];
    expect(order.indexOf(legend.skillTier)).toBeGreaterThan(order.indexOf(bronze.skillTier));
  });

  it("keeps predicted win rate within 0..100", () => {
    const r = analyzePlayer(1500, 40, 10, [
      { won: true, scoreDiff: 5 },
      { won: true, scoreDiff: 3 },
      { won: true, scoreDiff: 8 },
      { won: true, scoreDiff: 2 },
      { won: true, scoreDiff: 4 },
    ]);
    expect(r.predictedWinRate).toBeGreaterThanOrEqual(0);
    expect(r.predictedWinRate).toBeLessThanOrEqual(100);
  });

  it("handles a brand-new player with zero matches without crashing", () => {
    const r = analyzePlayer(1000, 0, 0, []);
    expect(r.skillTier).toBe("Gold");
    expect(Number.isFinite(r.playerPerformance)).toBe(true);
  });
});

describe("generateAssistantResponse", () => {
  it("answers tournament questions in Persian", () => {
    const r = generateAssistantResponse("چطور در تورنومنت شرکت کنم؟", { lang: "fa" });
    expect(r.response.length).toBeGreaterThan(0);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it("falls back to a general help reply in English", () => {
    const r = generateAssistantResponse("hello there", { lang: "en", userName: "Sam" });
    expect(r.response).toContain("Sam");
  });
});
