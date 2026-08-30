import { describe, expect, it } from "vitest";
import {
  calculateCodEntryReward,
  canTransitionCodRoomStatus,
  codRankPointsForResult,
  codRankTier,
  codReferralCommissionRial,
  estimateCodRoomMaximumLiability,
  isOfficialCodMobileInviteUrl,
  normalizeCodRewardConfig,
  shouldRevealCodRoomCredentials,
} from "./cod-room-policy";

const config = {
  perKillRial: "50000",
  participationRial: "10000",
  maxKillsPerEntry: 20,
  placementRules: [
    { from: 1, to: 1, amountRial: "1000000" },
    { from: 2, to: 3, amountRial: "500000" },
  ],
};

describe("COD room reward policy", () => {
  it("combines kill, placement and participation rewards", () => {
    const result = calculateCodEntryReward(config, 4, 2);
    expect(result.killRewardRial).toBe(BigInt(200000));
    expect(result.placementRewardRial).toBe(BigInt(500000));
    expect(result.participationRewardRial).toBe(BigInt(10000));
    expect(result.totalRewardRial).toBe(BigInt(710000));
  });

  it("rejects overlapping placement ranges", () => {
    expect(() => normalizeCodRewardConfig({
      ...config,
      placementRules: [
        { from: 1, to: 3, amountRial: "10" },
        { from: 3, to: 5, amountRial: "5" },
      ],
    })).toThrow(/هم‌پوشانی/);
  });

  it("rejects impossible kill totals", () => {
    expect(() => calculateCodEntryReward(config, 21, 1)).toThrow(/Kill/);
  });

  it("estimates solo and squad maximum liability conservatively", () => {
    const solo = estimateCodRoomMaximumLiability(config, 40, "solo");
    const squad = estimateCodRoomMaximumLiability(config, 40, "squad");
    expect(solo).toBe(BigInt(42_400_000));
    // A placement amount is a squad prize by default, so widening the team size does not
    // multiply the placement bill; both modes pay the same three placements.
    expect(squad).toBe(BigInt(42_400_000));
  });

  it("multiplies placement liability per player only when asked to", () => {
    const perEntry = { ...config, placementPayout: "per_entry" as const };
    expect(estimateCodRoomMaximumLiability(perEntry, 40, "squad")).toBe(BigInt(48_400_000));
  });
});

describe("COD room referral and rank policy", () => {
  it("pays referral only from the configured service-fee percentage", () => {
    expect(codReferralCommissionRial(BigInt(100000), 2000)).toBe(BigInt(20000));
    expect(codReferralCommissionRial(BigInt(0), 2000)).toBe(BigInt(0));
  });

  it("maps results to rank points and tiers", () => {
    expect(codRankPointsForResult(5, 1)).toBe(175);
    expect(codRankTier(0)).toBe("rookie");
    expect(codRankTier(3000)).toBe("ultra");
    expect(codRankTier(5000)).toBe("legend");
  });
});

describe("COD room security policy", () => {
  it("allows only official Call of Duty mobile invite links", () => {
    expect(isOfficialCodMobileInviteUrl("https://www.callofduty.com/cdn/codm/teaminvite/system_en_US.html?x=1")).toBe(true);
    expect(isOfficialCodMobileInviteUrl("https://callofduty.com.evil.example/cdn/codm/teaminvite/x")).toBe(false);
    expect(isOfficialCodMobileInviteUrl("javascript:alert(1)")).toBe(false);
  });

  it("requires registration and check-in before credential reveal", () => {
    const now = new Date("2026-07-20T10:00:00Z");
    expect(shouldRevealCodRoomCredentials({ isAdmin: false, isRegistered: true, checkedIn: true, revealAt: "2026-07-20T09:55:00Z", status: "check_in", now })).toBe(true);
    expect(shouldRevealCodRoomCredentials({ isAdmin: false, isRegistered: true, checkedIn: false, revealAt: "2026-07-20T09:55:00Z", status: "check_in", now })).toBe(false);
    expect(shouldRevealCodRoomCredentials({ isAdmin: true, isRegistered: false, checkedIn: false, revealAt: null, status: "draft", now })).toBe(true);
  });

  it("enforces an auditable room lifecycle", () => {
    expect(canTransitionCodRoomStatus("draft", "registration")).toBe(true);
    expect(canTransitionCodRoomStatus("registration", "completed")).toBe(false);
    expect(canTransitionCodRoomStatus("completed", "registration")).toBe(false);
  });
});
