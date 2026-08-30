import { describe, expect, it } from "vitest";
import { validateParsedLeaderboardRows } from "@/lib/clash-private-results-policy";

describe("private Clash leaderboard OCR validation", () => {
  it("normalizes tags, sorts ranks, and preserves optional scores", () => {
    expect(validateParsedLeaderboardRows({ rows: [
      { rank: 2, playerName: "Second", playerTag: "#8jcuv", score: "80" },
      { rank: 1, playerName: "First", playerTag: "2pylq0", score: 100 },
    ] }, 10)).toEqual([
      { rank: 1, playerName: "First", playerTag: "#2PYLQ0", score: 100 },
      { rank: 2, playerName: "Second", playerTag: "#8JCUV", score: 80 },
    ]);
  });

  it("drops duplicate/out-of-range ranks and empty hallucinations", () => {
    expect(validateParsedLeaderboardRows({ rows: [
      { rank: 1, playerName: "Valid" },
      { rank: 1, playerName: "Duplicate" },
      { rank: 11, playerName: "Too far" },
      { rank: 2, playerName: "" },
    ] }, 10)).toEqual([
      { rank: 1, playerName: "Valid", playerTag: null, score: null },
    ]);
  });
});
