import { describe, expect, it } from "vitest";
import { calculateDynamicTournamentPrizePool } from "./tournament-finance";

describe("calculateDynamicTournamentPrizePool", () => {
  it("calculates 20% site commission and 80% tiered distribution for paid tournaments", () => {
    // 10 players registered at 100,000 Toman each
    const result = calculateDynamicTournamentPrizePool({
      entryFee: "۱۰۰ هزار USDT",
      registeredCount: 10,
      maxPlayers: 16,
    });

    expect(result.isPaid).toBe(true);
    expect(result.entryFeeToman).toBe(100000);
    expect(result.totalCollectedToman).toBe(1000000); // 1,000,000
    expect(result.siteCommissionToman).toBe(200000); // 20% commission
    expect(result.netPrizePoolToman).toBe(800000); // 80% remaining

    expect(result.displayPrizePool).toBe("۸۰۰٬۰۰۰ USDT");
    expect(result.ladder[0].amountToman).toBe(280000); // 35% of 800k
    expect(result.ladder[1].amountToman).toBe(160000); // 20% of 800k
    expect(result.ladder[2].amountToman).toBe(96000); // 12% of 800k
    expect(result.ladder[3].amountToman).toBe(64000); // 8% of 800k
    expect(result.ladder[9].amountToman).toBe(24000); // 3% of 800k
  });

  it("handles 0 registered players by showing projection for max capacity", () => {
    const result = calculateDynamicTournamentPrizePool({
      entryFee: "50000",
      registeredCount: 0,
      maxPlayers: 20,
    });

    expect(result.totalCollectedToman).toBe(0);
    expect(result.netPrizePoolToman).toBe(0);
    expect(result.maxTotalCollectedToman).toBe(1000000); // 20 * 50,000
    expect(result.maxSiteCommissionToman).toBe(200000);
    expect(result.maxNetPrizePoolToman).toBe(800000);
    expect(result.displayPrizePool).toContain("۰ USDT");
  });

  describe("head-to-head duels (Clash Royale 1V1)", () => {
    // The 1V1 product is a matchmaking queue, so the tournament row carries
    // maxPlayers = 1000 (queue capacity). Treating that as a bracket size
    // advertised 1000 x 50,000 = 50,000,000 collected and a 40,000,000 prize
    // pool split ten ways, when the real match is two players for 80,000.
    const duel = (registeredCount: number) =>
      calculateDynamicTournamentPrizePool({
        entryFee: "50,000 USDT",
        registeredCount,
        maxPlayers: 1000,
        staticPrizePool: "80,000 USDT",
        isDuel: true,
      });

    it("caps the pool at two seats regardless of queue capacity", () => {
      const result = duel(0);

      expect(result.maxPlayers).toBe(2);
      expect(result.maxTotalCollectedToman).toBe(100_000);
      expect(result.maxSiteCommissionToman).toBe(20_000);
      expect(result.maxNetPrizePoolToman).toBe(80_000);
    });

    it("advertises the real 80,000 payout before anyone joins", () => {
      const result = duel(0);

      // Previously "۰ USDT (طبق ثبت‌نام)" with a 40,000,000 projection.
      expect(result.displayPrizePool).toBe("۸۰٬۰۰۰ USDT");
      expect(result.displayPrizePool).not.toContain("۰ USDT (طبق ثبت‌نام)");
    });

    it("is winner-takes-all, not a ten-place ladder", () => {
      const result = duel(2);

      expect(result.ladder).toHaveLength(1);
      expect(result.ladder[0].rank).toBe(1);
      expect(result.ladder[0].weight).toBe(1);
      // 35% of the pool (28,000) was the old, wrong first-place amount.
      expect(result.ladder[0].amountToman).toBe(80_000);
      expect(result.ladder[0].maxAmountToman).toBe(80_000);
    });

    it("matches the real economics once both players have paid", () => {
      const result = duel(2);

      expect(result.totalCollectedToman).toBe(100_000);
      expect(result.siteCommissionToman).toBe(20_000);
      expect(result.netPrizePoolToman).toBe(80_000);
    });

    it("never counts more than two entrants even if the queue is busy", () => {
      // The queue can hold many waiting players; a single match is still 1v1.
      const result = duel(37);

      expect(result.registeredCount).toBe(2);
      expect(result.totalCollectedToman).toBe(100_000);
      expect(result.netPrizePoolToman).toBe(80_000);
    });

    it("leaves pooled tournaments untouched", () => {
      const pooled = calculateDynamicTournamentPrizePool({
        entryFee: "50,000 USDT",
        registeredCount: 10,
        maxPlayers: 16,
      });

      expect(pooled.ladder).toHaveLength(10);
      expect(pooled.netPrizePoolToman).toBe(400_000);
    });
  });

  it("ensures ladder weights sum up to exactly 100% (1.00)", () => {
    const result = calculateDynamicTournamentPrizePool({
      entryFee: "1000",
      registeredCount: 10,
    });
    const totalWeight = result.ladder.reduce((sum, item) => sum + item.weight, 0);
    expect(Math.round(totalWeight * 100)).toBe(100);
  });
});
