import { describe, expect, it } from "vitest";
import { computeCodSettlementRewards } from "./cod-room-service";
import {
  calculateCodEntryReward,
  codPrizeScaleBps,
  normalizeCodPrizeScaling,
  projectCodPrizeTable,
} from "./cod-room-policy";

const toman = (value: number) => BigInt(value) * BigInt(10);
const asToman = (rial: string | bigint) => Number(BigInt(rial) / BigInt(10));

// BR-iso-870: 100 seats at 23,000 toman, advertising 1,590,000 toman of prizes.
const brIso870 = {
  placementPayout: "per_team" as const,
  placementRules: [
    { from: 1, to: 1, amountRial: toman(400_000).toString() },
    { from: 2, to: 2, amountRial: toman(320_000).toString() },
    { from: 3, to: 3, amountRial: toman(230_000).toString() },
    { from: 4, to: 11, amountRial: toman(80_000).toString() },
  ],
};

describe("the problem scaling exists to solve", () => {
  it("loses money on a half-empty room when prizes are fixed", () => {
    const table = projectCodPrizeTable({
      rewardConfig: brIso870,
      scaling: { mode: "fixed" },
      registeredCount: 20,
      capacity: 100,
      teamMode: "squad",
    });
    const income = toman(23_000) * BigInt(20);
    expect(BigInt(table.totalCurrentRial)).toBe(toman(1_590_000));
    expect(BigInt(table.totalCurrentRial)).toBeGreaterThan(income);
    // 1,590,000 owed against 460,000 collected.
    expect(asToman(income)).toBe(460_000);
  });

  it("keeps the same margin at 20 players as at 100 when prizes scale", () => {
    const quiet = projectCodPrizeTable({
      rewardConfig: brIso870, scaling: {}, registeredCount: 20, capacity: 100, teamMode: "squad",
    });
    const full = projectCodPrizeTable({
      rewardConfig: brIso870, scaling: {}, registeredCount: 100, capacity: 100, teamMode: "squad",
    });
    const quietMargin = Number(toman(23_000) * BigInt(20) - BigInt(quiet.totalCurrentRial))
      / Number(toman(23_000) * BigInt(20));
    const fullMargin = Number(toman(23_000) * BigInt(100) - BigInt(full.totalCurrentRial))
      / Number(toman(23_000) * BigInt(100));
    expect(quietMargin).toBeCloseTo(fullMargin, 5);
    expect(quietMargin).toBeGreaterThan(0);
  });
});

describe("prize scale factor", () => {
  const scaling = normalizeCodPrizeScaling({});

  it("pays the full table only when the room fills", () => {
    expect(codPrizeScaleBps(scaling, 100, 100)).toBe(10_000);
  });

  it("scales linearly with occupancy", () => {
    expect(codPrizeScaleBps(scaling, 50, 100)).toBe(5_000);
    expect(codPrizeScaleBps(scaling, 25, 100)).toBe(2_500);
    expect(codPrizeScaleBps(scaling, 0, 100)).toBe(0);
  });

  it("never scales above 100% even if somehow oversubscribed", () => {
    expect(codPrizeScaleBps(scaling, 140, 100)).toBe(10_000);
  });

  it("can pay the full table before the room is completely full", () => {
    // A room that promises headline prizes once 80% of seats sell.
    const generous = normalizeCodPrizeScaling({ fullPayoutAtBps: 8_000 });
    expect(codPrizeScaleBps(generous, 80, 100)).toBe(10_000);
    expect(codPrizeScaleBps(generous, 40, 100)).toBe(5_000);
  });

  it("ignores occupancy entirely in fixed mode", () => {
    const fixed = normalizeCodPrizeScaling({ mode: "fixed" });
    expect(codPrizeScaleBps(fixed, 1, 100)).toBe(10_000);
  });
});

describe("projected prize table", () => {
  it("reports both the headline and the amount payable right now", () => {
    const table = projectCodPrizeTable({
      rewardConfig: brIso870, scaling: {}, registeredCount: 50, capacity: 100, teamMode: "squad",
    });
    expect(table.scalePercent).toBe(50);
    expect(table.fillPercent).toBe(50);
    expect(table.isFullPayout).toBe(false);
    const first = table.rows.find((row) => row.from === 1)!;
    expect(asToman(first.fullAmountRial)).toBe(400_000);
    expect(asToman(first.currentAmountRial)).toBe(200_000);
    // A squad prize still splits four ways on top of being scaled.
    expect(asToman(first.perPlayerRial)).toBe(50_000);
  });

  it("flags a room that has not reached the viable minimum", () => {
    const table = projectCodPrizeTable({
      rewardConfig: brIso870, scaling: {}, registeredCount: 10, capacity: 100, teamMode: "squad",
    });
    expect(table.meetsMinimum).toBe(false);
    expect(table.minimumPlayers).toBe(25);
  });

  it("clears the minimum once enough players join", () => {
    const table = projectCodPrizeTable({
      rewardConfig: brIso870, scaling: {}, registeredCount: 25, capacity: 100, teamMode: "squad",
    });
    expect(table.meetsMinimum).toBe(true);
  });

  it("scales kill rewards and ladders too, not just placements", () => {
    const table = projectCodPrizeTable({
      rewardConfig: {
        perKillRial: toman(50_000).toString(),
        killLadder: { firstKillRial: toman(100_000).toString(), divisor: 2, minKillRial: toman(10_000).toString() },
      },
      scaling: {},
      registeredCount: 24,
      capacity: 48,
      teamMode: "squad",
    });
    expect(asToman(table.perKillCurrentRial)).toBe(25_000);
    expect(asToman(table.killLadderCurrent!.firstKillRial)).toBe(50_000);
    expect(asToman(table.killLadderCurrent!.minKillRial)).toBe(5_000);
  });
});

describe("settlement honours the same scale as the room page advertised", () => {
  it("pays a scaled placement prize", () => {
    const scaleBps = codPrizeScaleBps(normalizeCodPrizeScaling({}), 50, 100);
    const reward = calculateCodEntryReward(brIso870, 0, 1, { placementSharers: 4, scaleBps });
    // 400,000 squad prize -> halved for a half-full room -> split four ways.
    expect(asToman(reward.placementRewardRial)).toBe(50_000);
  });

  it("pays the advertised amount when the room filled", () => {
    const reward = calculateCodEntryReward(brIso870, 0, 1, { placementSharers: 4, scaleBps: 10_000 });
    expect(asToman(reward.placementRewardRial)).toBe(100_000);
  });

  it("defaults to no scaling so an unaware caller cannot silently underpay", () => {
    const reward = calculateCodEntryReward(brIso870, 0, 1, { placementSharers: 4 });
    expect(asToman(reward.placementRewardRial)).toBe(100_000);
  });

  it("scales a per-kill reward at settlement", () => {
    const config = { perKillRial: toman(10_000).toString(), maxKillsPerEntry: 40 };
    const reward = calculateCodEntryReward(config, 3, null, { scaleBps: 5_000 });
    expect(asToman(reward.killRewardRial)).toBe(15_000);
  });
});

describe("scaling configuration validation", () => {
  it("defaults to scaled with a 25% viability floor", () => {
    expect(normalizeCodPrizeScaling(undefined)).toEqual({
      mode: "scaled", fullPayoutAtBps: 10_000, minimumViableBps: 2_500,
    });
  });

  it("rejects an unknown mode", () => {
    expect(() => normalizeCodPrizeScaling({ mode: "sometimes" })).toThrow();
  });

  it("rejects a minimum that sits above the full-payout threshold", () => {
    expect(() => normalizeCodPrizeScaling({ fullPayoutAtBps: 5_000, minimumViableBps: 8_000 })).toThrow();
  });
});

describe("settleCodRoom's reward computation", () => {
  const room = { rewardConfig: brIso870, prizeScaling: {}, capacity: 100 };
  const squad = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const firstPlace = squad.map((entry) => ({ entryId: entry.id, kills: 0, placement: 1 }));

  it("scales the payout down for a half-empty room", () => {
    const rewards = computeCodSettlementRewards({
      room, entries: squad, results: firstPlace, advertisedEntryCount: 50,
    });
    // 400,000 squad prize, halved for a half-full room, split four ways.
    for (const row of rewards) expect(asToman(row.reward.totalRewardRial)).toBe(50_000);
  });

  it("pays the advertised amount when the room filled", () => {
    const rewards = computeCodSettlementRewards({
      room, entries: squad, results: firstPlace, advertisedEntryCount: 100,
    });
    for (const row of rewards) expect(asToman(row.reward.totalRewardRial)).toBe(100_000);
  });

  it("never pays out more than the room collected", () => {
    for (const players of [10, 25, 50, 75, 100]) {
      const table = projectCodPrizeTable({
        rewardConfig: brIso870, scaling: {}, registeredCount: players, capacity: 100, teamMode: "squad",
      });
      const collected = toman(23_000) * BigInt(players);
      expect(BigInt(table.totalCurrentRial)).toBeLessThan(collected);
    }
  });

  it("does not shrink the prize because a paid player failed to show up", () => {
    // Four paid seats, one no-show: only three are settled, but all four paid,
    // so the advertised occupancy is still four.
    const settled = squad.slice(0, 3);
    const rewards = computeCodSettlementRewards({
      room: { ...room, capacity: 4 },
      entries: settled,
      results: settled.map((entry) => ({ entryId: entry.id, kills: 0, placement: 1 })),
      advertisedEntryCount: 4,
    });
    // Full occupancy, so the headline prize, split between the three who placed.
    expect(rewards.map((row) => asToman(row.reward.totalRewardRial))).toEqual([
      133_333, 133_333, 133_333,
    ]);
  });

  it("honours fixed mode for a sponsored room", () => {
    const rewards = computeCodSettlementRewards({
      room: { ...room, prizeScaling: { mode: "fixed" } },
      entries: squad,
      results: firstPlace,
      advertisedEntryCount: 12,
    });
    for (const row of rewards) expect(asToman(row.reward.totalRewardRial)).toBe(100_000);
  });
});

describe("what an empty room advertises", () => {
  it("leads with the headline amounts rather than a table of zeroes", () => {
    const table = projectCodPrizeTable({
      rewardConfig: brIso870, scaling: {}, registeredCount: 0, capacity: 100, teamMode: "squad",
    });
    // Scaling to zero is correct arithmetic but a terrible advert, so the room
    // page is told to show the full amounts captioned as conditional.
    expect(table.scaleBps).toBe(0);
    expect(table.showHeadlineAmounts).toBe(true);
    expect(asToman(table.totalFullRial)).toBe(1_590_000);
  });

  it("keeps showing headline amounts until the room is viable", () => {
    for (const players of [1, 10, 24]) {
      const table = projectCodPrizeTable({
        rewardConfig: brIso870, scaling: {}, registeredCount: players, capacity: 100, teamMode: "squad",
      });
      expect(table.showHeadlineAmounts).toBe(true);
    }
  });

  it("switches to live amounts once the room can actually run", () => {
    const table = projectCodPrizeTable({
      rewardConfig: brIso870, scaling: {}, registeredCount: 25, capacity: 100, teamMode: "squad",
    });
    expect(table.meetsMinimum).toBe(true);
    expect(table.showHeadlineAmounts).toBe(false);
    expect(asToman(table.totalCurrentRial)).toBe(397_500);
  });

  it("still settles at the scaled amount even while headlines are displayed", () => {
    // Display and payout are separate decisions: a room that somehow settled
    // below its minimum must not pay the headline.
    const scaleBps = codPrizeScaleBps(normalizeCodPrizeScaling({}), 10, 100);
    const reward = calculateCodEntryReward(brIso870, 0, 1, { placementSharers: 4, scaleBps });
    expect(asToman(reward.placementRewardRial)).toBe(10_000);
  });
});
