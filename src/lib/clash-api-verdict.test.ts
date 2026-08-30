import { describe, expect, it } from "vitest";
import {
  CLASH_VERDICT_RETRY_DELAYS_MS,
  clashVerdictMessage,
  decideClashVerdict,
  isRetryableClashVerdict,
  nextClashVerdictRetryDelayMs,
  type ClashVerdictBattle,
} from "./clash-api-verdict";

const battle = (over: Partial<ClashVerdictBattle> = {}): ClashVerdictBattle => ({
  battleTime: new Date("2026-08-01T12:00:00Z"),
  player1Tag: "#AAA",
  player2Tag: "#BBB",
  player1Crowns: 3,
  player2Crowns: 1,
  winnerTag: "#AAA",
  ...over,
});

describe("decideClashVerdict", () => {
  it("declares the higher crown count the winner", () => {
    const verdict = decideClashVerdict({
      battle: battle(),
      player1Tag: "#AAA",
      player2Tag: "#BBB",
      apiConfigured: true,
    });
    expect(verdict.state).toBe("decided");
    expect(verdict.winnerTag).toBe("#AAA");
    expect(verdict.loserTag).toBe("#BBB");
  });

  it("works when player 2 is the winner, not just player 1", () => {
    const verdict = decideClashVerdict({
      battle: battle({ player1Crowns: 0, player2Crowns: 2, winnerTag: "#BBB" }),
      player1Tag: "#AAA",
      player2Tag: "#BBB",
      apiConfigured: true,
    });
    expect(verdict.state).toBe("decided");
    expect(verdict.winnerTag).toBe("#BBB");
    expect(verdict.loserTag).toBe("#AAA");
  });

  it("never decides a winner when the crowns are level", () => {
    const verdict = decideClashVerdict({
      battle: battle({ player1Crowns: 2, player2Crowns: 2, winnerTag: null }),
      player1Tag: "#AAA",
      player2Tag: "#BBB",
      apiConfigured: true,
    });
    expect(verdict.state).toBe("draw");
    expect(verdict.winnerTag).toBeUndefined();
  });

  it("treats equal crowns as a draw even if the API named a winner", () => {
    // Defensive: never pay out on a contradictory payload.
    const verdict = decideClashVerdict({
      battle: battle({ player1Crowns: 2, player2Crowns: 2, winnerTag: "#AAA" }),
      player1Tag: "#AAA",
      player2Tag: "#BBB",
      apiConfigured: true,
    });
    expect(verdict.state).toBe("draw");
  });

  it("rejects a wrong-mode battle before looking at the winner", () => {
    const verdict = decideClashVerdict({
      battle: battle(),
      player1Tag: "#AAA",
      player2Tag: "#BBB",
      apiConfigured: true,
      modeMatches: false,
    });
    expect(verdict.state).toBe("mode_mismatch");
    expect(verdict.winnerTag).toBeUndefined();
  });

  it("reports missing tags rather than pretending the battle is absent", () => {
    expect(decideClashVerdict({
      battle: battle(),
      player1Tag: null,
      player2Tag: "#BBB",
      apiConfigured: true,
    }).state).toBe("missing_tags");
  });

  it("waits when the battle has not surfaced yet", () => {
    expect(decideClashVerdict({
      battle: null,
      player1Tag: "#AAA",
      player2Tag: "#BBB",
      apiConfigured: true,
    }).state).toBe("pending_api");
  });

  it("reports an unconfigured API instead of silently passing", () => {
    expect(decideClashVerdict({
      battle: battle(),
      player1Tag: "#AAA",
      player2Tag: "#BBB",
      apiConfigured: false,
    }).state).toBe("api_error");
  });

  it("carries the crown counts through for the audit trail", () => {
    const verdict = decideClashVerdict({
      battle: battle({ player1Crowns: 3, player2Crowns: 2 }),
      player1Tag: "#AAA",
      player2Tag: "#BBB",
      apiConfigured: true,
    });
    expect(verdict.player1Crowns).toBe(3);
    expect(verdict.player2Crowns).toBe(2);
    expect(verdict.battleTime).toBe("2026-08-01T12:00:00.000Z");
  });
});

describe("retry schedule", () => {
  it("only retries states that could still change", () => {
    expect(isRetryableClashVerdict("pending_api")).toBe(true);
    expect(isRetryableClashVerdict("api_error")).toBe(true);
    expect(isRetryableClashVerdict("decided")).toBe(false);
    expect(isRetryableClashVerdict("draw")).toBe(false);
    expect(isRetryableClashVerdict("mode_mismatch")).toBe(false);
    expect(isRetryableClashVerdict("missing_tags")).toBe(false);
  });

  it("backs off and then gives up", () => {
    expect(nextClashVerdictRetryDelayMs(0)).toBe(60_000);
    expect(nextClashVerdictRetryDelayMs(1)).toBe(120_000);
    expect(nextClashVerdictRetryDelayMs(CLASH_VERDICT_RETRY_DELAYS_MS.length)).toBeNull();
  });

  it("increases monotonically so retries never stampede the API", () => {
    for (let i = 1; i < CLASH_VERDICT_RETRY_DELAYS_MS.length; i += 1) {
      expect(CLASH_VERDICT_RETRY_DELAYS_MS[i]).toBeGreaterThan(CLASH_VERDICT_RETRY_DELAYS_MS[i - 1]);
    }
  });
});

describe("clashVerdictMessage", () => {
  it("has Persian copy for every state", () => {
    for (const state of ["decided", "draw", "mode_mismatch", "missing_tags", "pending_api", "api_error"] as const) {
      expect(clashVerdictMessage(state).length).toBeGreaterThan(10);
    }
  });
});
