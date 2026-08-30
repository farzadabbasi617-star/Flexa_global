import { afterEach, describe, expect, it, vi } from "vitest";
import { codArenaLive, normalizeCodRoomInput } from "./cod-room-service";

const base = {
  title: "Global Solo Beta",
  region: "global",
  map: "isolated",
  teamMode: "solo",
  perspective: "tpp",
  status: "registration",
  isPublished: true,
  capacity: 10,
  entryFeeRial: "100000",
  serviceFeeRial: "20000",
  prizeBudgetRial: "20000",
  referralRateBps: 2000,
  rewardConfig: {
    perKillRial: "100",
    participationRial: "0",
    maxKillsPerEntry: 2,
    placementRules: [],
  },
  startsAt: "2027-01-01T12:00:00.000Z",
  officialJoinUrl: "https://www.callofduty.com/cdn/codm/teaminvite/system_en_US.html?room=beta",
};

describe("COD room input normalization", () => {
  it("normalizes both supported regions and safe economics", () => {
    const global = normalizeCodRoomInput(base);
    const garena = normalizeCodRoomInput({ ...base, region: "garena" });
    expect(global.region).toBe("global");
    expect(garena.region).toBe("garena");
    expect(global.maximumLiabilityRial).toBe("2000");
  });

  it("blocks publishing a draft", () => {
    expect(() => normalizeCodRoomInput({ ...base, status: "draft" })).toThrow(/Draft/);
  });

  it("blocks a service fee larger than the entry fee", () => {
    expect(() => normalizeCodRoomInput({ ...base, serviceFeeRial: "100001" })).toThrow(/کارمزد/);
  });

  it("blocks a published room whose reward liability is underfunded", () => {
    expect(() => normalizeCodRoomInput({ ...base, prizeBudgetRial: "1999" })).toThrow(/بودجه/);
  });
});

describe("COD Arena financial kill switch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires both independent production approvals", () => {
    vi.stubEnv("COD_ARENA_LIVE", "true");
    vi.stubEnv("COD_ARENA_FINANCE_APPROVED", "false");
    expect(codArenaLive()).toBe(false);
    vi.stubEnv("COD_ARENA_FINANCE_APPROVED", "true");
    expect(codArenaLive()).toBe(true);
  });
});
