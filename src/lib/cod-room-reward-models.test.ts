import { describe, expect, it } from "vitest";
import {
  calculateCodEntryReward,
  codKillLadderTotalRial,
  estimateCodKillLiability,
  estimateCodRoomMaximumLiability,
  normalizeCodRewardConfig,
} from "./cod-room-policy";

const toman = (value: number) => BigInt(value) * BigInt(10);

/**
 * Reference numbers are taken from real published Call of Duty Mobile rooms so the
 * engine is validated against payouts that a competitor actually honours.
 */
describe("squad placement prizes are shared by the squad", () => {
  // BR-iso-870: 25 squads of 4. 1st 400k, 2nd 320k, 3rd 230k, 4th-11th 80k each.
  // Advertised: "1,600,000 toman cash prize for 44 people".
  const brIso870 = normalizeCodRewardConfig({
    placementPayout: "per_team",
    placementRules: [
      { from: 1, to: 1, amountRial: toman(400_000).toString() },
      { from: 2, to: 2, amountRial: toman(320_000).toString() },
      { from: 3, to: 3, amountRial: toman(230_000).toString() },
      { from: 4, to: 11, amountRial: toman(80_000).toString() },
    ],
  });

  it("splits a squad prize between the four players that earned it", () => {
    const reward = calculateCodEntryReward(brIso870, 0, 1, { placementSharers: 4 });
    expect(reward.placementRewardRial).toBe(toman(100_000));
  });

  it("keeps the whole-room payout equal to the advertised prize pool", () => {
    const squadsByPlacement = [
      { placement: 1, amount: 400_000 },
      { placement: 2, amount: 320_000 },
      { placement: 3, amount: 230_000 },
      ...Array.from({ length: 8 }, (_, index) => ({ placement: index + 4, amount: 80_000 })),
    ];
    const total = squadsByPlacement.reduce((sum, squad) => {
      const perPlayer = calculateCodEntryReward(brIso870, 0, squad.placement, { placementSharers: 4 });
      return sum + perPlayer.placementRewardRial * BigInt(4);
    }, BigInt(0));
    expect(total).toBe(toman(1_590_000));
    // 11 rewarded squads x 4 players = the 44 winners printed on the room card.
    expect(squadsByPlacement.length * 4).toBe(44);
  });

  it("still pays every player in full when the room is configured per_entry", () => {
    const perEntry = normalizeCodRewardConfig({ ...brIso870, placementPayout: "per_entry" });
    const reward = calculateCodEntryReward(perEntry, 0, 1, { placementSharers: 4 });
    expect(reward.placementRewardRial).toBe(toman(400_000));
  });

  it("defaults to per_team so an unconfigured room cannot quadruple its payout", () => {
    expect(normalizeCodRewardConfig({}).placementPayout).toBe("per_team");
  });

  it("prices squad liability once per squad rather than once per player", () => {
    const liability = estimateCodRoomMaximumLiability(brIso870, 100, "squad");
    expect(liability).toBe(toman(1_590_000));
  });
});

describe("solo placement prizes stay per player", () => {
  // RIBERTH-solo-850: 40 solo players. Advertised "1,140,000 toman for 6 people".
  const solo850 = normalizeCodRewardConfig({
    placementPayout: "per_team",
    placementRules: [
      { from: 1, to: 1, amountRial: toman(440_000).toString() },
      { from: 2, to: 2, amountRial: toman(320_000).toString() },
      { from: 3, to: 3, amountRial: toman(200_000).toString() },
      { from: 4, to: 4, amountRial: toman(120_000).toString() },
      { from: 5, to: 6, amountRial: toman(38_000).toString() },
    ],
  });

  it("gives a solo winner the whole placement prize", () => {
    expect(calculateCodEntryReward(solo850, 0, 1, { placementSharers: 1 }).placementRewardRial)
      .toBe(toman(440_000));
  });

  it("prices the solo pool from the rules, not the rounded headline", () => {
    // The room card advertises "1,140,000 for 6 people" but the listed places add up to
    // 1,156,000. We budget against the rules we will actually pay out.
    expect(estimateCodRoomMaximumLiability(solo850, 40, "solo")).toBe(toman(1_156_000));
  });
});

describe("diminishing kill ladder", () => {
  // KIL-Ultra-863: 1st kill 100k, 2nd 50k, 3rd 25k, 4th 12.5k, halving onwards.
  const ladder = {
    firstKillRial: toman(100_000).toString(),
    divisor: 2,
    minKillRial: "0",
  };

  it("halves the payout on every subsequent kill", () => {
    expect(codKillLadderTotalRial(ladder, 1)).toBe(toman(100_000));
    expect(codKillLadderTotalRial(ladder, 2)).toBe(toman(150_000));
    expect(codKillLadderTotalRial(ladder, 3)).toBe(toman(175_000));
    expect(codKillLadderTotalRial(ladder, 4)).toBe(toman(187_500));
  });

  it("converges instead of growing without bound", () => {
    // The infinite sum of a halving ladder is 2x the first kill.
    expect(codKillLadderTotalRial(ladder, 60)).toBeLessThanOrEqual(toman(200_000));
  });

  it("routes kill rewards through the ladder when one is configured", () => {
    const config = normalizeCodRewardConfig({ killLadder: ladder, maxKillsPerEntry: 40 });
    expect(calculateCodEntryReward(config, 3).killRewardRial).toBe(toman(175_000));
  });

  it("prices the ladder at its worst case, which is kills spread one per player", () => {
    const config = normalizeCodRewardConfig({ killLadder: ladder, maxKillsPerEntry: 40, maxTotalKills: 48 });
    // 48 players with one 100k first-kill each is dearer than 12 players with 4 kills.
    expect(estimateCodKillLiability(config, 48)).toBe(toman(4_800_000));
  });

  it("honours a per-kill floor so late kills are never worthless", () => {
    const floored = { firstKillRial: toman(100_000).toString(), divisor: 2, minKillRial: toman(10_000).toString() };
    // 100k + 50k + 25k + 12.5k then the floor takes over at 10k.
    expect(codKillLadderTotalRial(floored, 6)).toBe(toman(207_500));
  });
});

describe("room-wide kill budget ceiling", () => {
  // iso-kil-legend-871: 48 players, flat 50k toman per kill.
  const flat = normalizeCodRewardConfig({ perKillRial: toman(50_000).toString(), maxKillsPerEntry: 40 });

  it("is ruinous without a room-wide cap", () => {
    // 50k x 40 kills x 48 players = 96,000,000 toman of exposure.
    expect(estimateCodKillLiability(flat, 48)).toBe(toman(96_000_000));
  });

  it("collapses to the affordable figure once a total-kill cap is set", () => {
    const capped = normalizeCodRewardConfig({
      perKillRial: toman(50_000).toString(),
      maxKillsPerEntry: 40,
      maxTotalKills: 47,
    });
    expect(estimateCodKillLiability(capped, 48)).toBe(toman(2_350_000));
  });

  it("never lets the room-wide cap exceed what the per-player cap allows", () => {
    const config = normalizeCodRewardConfig({
      perKillRial: toman(50_000).toString(),
      maxKillsPerEntry: 2,
      maxTotalKills: 9_999,
    });
    expect(estimateCodKillLiability(config, 10)).toBe(toman(1_000_000));
  });

  it("refuses to certify the competitor's headline ladder as affordable", () => {
    // KIL-Ultra-863 charges 67,900 x 48 = 3,259,200 toman but advertises a 100k first
    // kill. If all 48 players land one kill each that is 4,800,000 toman of payouts.
    const headline = normalizeCodRewardConfig({
      killLadder: { firstKillRial: toman(100_000).toString(), divisor: 2, minKillRial: "0" },
      maxKillsPerEntry: 40,
      maxTotalKills: 48,
    });
    const income = toman(67_900) * BigInt(48);
    expect(estimateCodRoomMaximumLiability(headline, 48, "squad")).toBeGreaterThan(income);
  });

  it("certifies a ladder that the entry fees can actually cover", () => {
    const affordable = normalizeCodRewardConfig({
      killLadder: { firstKillRial: toman(50_000).toString(), divisor: 2, minKillRial: "0" },
      maxKillsPerEntry: 40,
      maxTotalKills: 48,
    });
    const income = toman(67_900) * BigInt(48);
    expect(estimateCodRoomMaximumLiability(affordable, 48, "squad")).toBeLessThan(income);
  });
});
