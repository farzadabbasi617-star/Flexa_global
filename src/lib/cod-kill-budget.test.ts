import { describe, expect, it } from "vitest";
import { calculateCodEntryReward, codKillBudgetScaleBps, estimateCodRoomMaximumLiability, normalizeCodRewardConfig } from "./cod-room-policy";

const toman = (value: number) => (BigInt(value) * BigInt(10)).toString();

/**
 * `maxTotalKills` used to be read only by the pre-publish estimate. A free
 * "second chance" room advertising a 450,000 toman kill budget would have paid
 * out three times that if the lobby produced three times the expected kills,
 * with nothing to notice it because the room takes no entry fees.
 */
describe("codKillBudgetScaleBps", () => {
  it("is a no-op when the room has no room-wide cap", () => {
    expect(codKillBudgetScaleBps(0, 500)).toBe(10_000);
  });

  it("is a no-op when the lobby stayed inside the cap", () => {
    expect(codKillBudgetScaleBps(90, 89)).toBe(10_000);
    expect(codKillBudgetScaleBps(90, 90)).toBe(10_000);
  });

  it("halves the per-kill value when the lobby produced twice the cap", () => {
    expect(codKillBudgetScaleBps(90, 180)).toBe(5_000);
  });

  it("scales proportionally for an arbitrary overshoot", () => {
    expect(codKillBudgetScaleBps(90, 270)).toBe(3_333);
  });

  it("treats junk input as no cap rather than paying zero", () => {
    expect(codKillBudgetScaleBps(Number.NaN, 100)).toBe(10_000);
    expect(codKillBudgetScaleBps(-5, 100)).toBe(10_000);
  });
});

describe("the free second-chance room cannot exceed its advertised budget", () => {
  // Solo, revive disabled, no self-revive: 90 seats, 5,000 toman per kill,
  // room-wide budget of 90 kills = 450,000 toman.
  const config = normalizeCodRewardConfig({
    perKillRial: toman(5_000),
    maxKillsPerEntry: 8,
    maxTotalKills: 90,
    placementRules: [],
  });

  it("advertises a 450,000 toman ceiling before publishing", () => {
    expect(estimateCodRoomMaximumLiability(config, 90, "solo")).toBe(BigInt(toman(450_000)));
  });

  it("still pays at most that when the lobby overshoots", () => {
    const recorded = 270;
    const bps = codKillBudgetScaleBps(config.maxTotalKills, recorded);
    let total = BigInt(0);
    for (let i = 0; i < 90; i += 1) {
      total += calculateCodEntryReward(config, 3, null, { scaleBps: bps }).killRewardRial;
    }
    // Integer division rounds each player's share down, so the paid total lands
    // at or just under the advertised ceiling -- never above it.
    expect(total).toBeLessThanOrEqual(BigInt(toman(450_000)));
    expect(total).toBeGreaterThan(BigInt(toman(440_000)));
  });

  it("pays the full rate when the lobby lands under the cap", () => {
    const recorded = 89;
    const bps = codKillBudgetScaleBps(config.maxTotalKills, recorded);
    expect(bps).toBe(10_000);
    const reward = calculateCodEntryReward(config, 1, null, { scaleBps: bps });
    expect(reward.killRewardRial).toBe(BigInt(toman(5_000)));
  });
});
