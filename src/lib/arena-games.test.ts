import { describe, expect, it } from "vitest";
import {
  arenaCompositionLabel,
  arenaGameConfig,
  arenaTeamSize,
  isArenaGame,
  isOfficialInviteUrl,
} from "./arena-games";
import { calculateCodEntryReward, estimateCodRoomMaximumLiability, projectCodPrizeTable } from "./cod-room-policy";

const toRial = (t: number) => String(BigInt(t) * BigInt(10));
const asToman = (r: string | bigint) => Number(BigInt(r) / BigInt(10));

describe("game identification", () => {
  it("recognises the supported titles", () => {
    expect(isArenaGame("cod_mobile")).toBe(true);
    expect(isArenaGame("fortnite")).toBe(true);
  });

  it("rejects anything else rather than inventing a config", () => {
    expect(isArenaGame("pubg")).toBe(false);
    expect(isArenaGame(null)).toBe(false);
  });

  it("falls back to Call of Duty so pre-existing rows keep working", () => {
    // Every row that existed before migration 0044 has no game value.
    expect(arenaGameConfig(undefined).id).toBe("cod_mobile");
    expect(arenaGameConfig("unknown_game").id).toBe("cod_mobile");
  });
});

describe("team sizes", () => {
  it("knows Fortnite trios, which Call of Duty does not have", () => {
    expect(arenaTeamSize("fortnite", "trio")).toBe(3);
    expect(arenaGameConfig("fortnite").teamModes).toContain("trio");
    expect(arenaGameConfig("cod_mobile").teamModes).not.toContain("trio");
  });

  it("agrees on the modes both games share", () => {
    for (const mode of ["solo", "duo", "squad"]) {
      expect(arenaTeamSize("fortnite", mode)).toBe(arenaTeamSize("cod_mobile", mode));
    }
  });

  it("splits a trio placement prize three ways, not one", () => {
    const config = {
      placementPayout: "per_team" as const,
      placementRules: [{ from: 1, to: 1, amountRial: toRial(300_000) }],
    };
    expect(asToman(calculateCodEntryReward(config, 0, 1, { placementSharers: 3 }).placementRewardRial))
      .toBe(100_000);
  });

  it("derives the per-player share of a trio prize without being told the size", () => {
    // The prize table on the room page never passes a sharer count; it relies on
    // teamSize resolving the mode. If "trio" fell through to 1, every one of the
    // three players would be shown the whole squad prize as their own.
    const table = projectCodPrizeTable({
      rewardConfig: {
        placementPayout: "per_team",
        placementRules: [{ from: 1, to: 1, amountRial: toRial(300_000) }],
      },
      scaling: { mode: "fixed" },
      registeredCount: 99,
      capacity: 99,
      teamMode: "trio",
    });
    expect(asToman(table.rows[0].perPlayerRial)).toBe(100_000);
  });

  it("prices a trio room's liability once per trio, not once per player", () => {
    // 33 trios can place first; only one of them does, so the room owes the
    // prize once. Falling through to a size of 1 would have tripled this.
    const config = {
      placementPayout: "per_team" as const,
      placementRules: [{ from: 1, to: 3, amountRial: toRial(300_000) }],
    };
    expect(asToman(estimateCodRoomMaximumLiability(config, 99, "trio"))).toBe(900_000);
  });
});

describe("invite links", () => {
  it("accepts a genuine Call of Duty invite", () => {
    expect(isOfficialInviteUrl("cod_mobile", "https://www.callofduty.com/cdn/codm/teaminvite/x.html")).toBe(true);
  });

  it("rejects every URL for Fortnite, which has no invite-link form", () => {
    // Fortnite lobbies are joined with an Epic Custom Matchmaking Key typed on
    // the lobby screen, so accepting a link would strand players.
    expect(isOfficialInviteUrl("fortnite", "https://www.fortnite.com/invite/abc")).toBe(false);
    expect(isOfficialInviteUrl("fortnite", "https://www.callofduty.com/cdn/codm/teaminvite/x.html")).toBe(false);
    expect(arenaGameConfig("fortnite").entryMethods).toEqual(["code"]);
  });

  it("rejects a look-alike host and non-HTTPS", () => {
    expect(isOfficialInviteUrl("cod_mobile", "https://evil.com/cdn/codm/teaminvite/x")).toBe(false);
    expect(isOfficialInviteUrl("cod_mobile", "http://www.callofduty.com/cdn/codm/teaminvite/x")).toBe(false);
  });
});

describe("regions", () => {
  it("keeps the two games' region lists apart", () => {
    expect(arenaGameConfig("cod_mobile").regions).toEqual(["global", "garena"]);
    expect(arenaGameConfig("fortnite").regions).toContain("me");
    expect(arenaGameConfig("fortnite").regions).not.toContain("garena");
  });

  it("does not tie a Fortnite player to a stored region", () => {
    // Fortnite players pick a server per match, so users.fortnite_* has no
    // region column and a room must not try to match one.
    expect(arenaGameConfig("fortnite").profileFields.region).toBeUndefined();
    expect(arenaGameConfig("cod_mobile").profileFields.region).toBe("codMobileRegion");
  });
});

describe("account level gate", () => {
  it("is only advertised for the game that has one", () => {
    expect(arenaGameConfig("cod_mobile").levelGateLabel).toContain("لول");
    expect(arenaGameConfig("fortnite").levelGateLabel).toBeNull();
  });
});

describe("composition labels", () => {
  it("counts teams for team modes and players for solo", () => {
    expect(arenaCompositionLabel("fortnite", "squad", 100)).toBe("۲۵ تیم ۴ نفره");
    expect(arenaCompositionLabel("fortnite", "trio", 99)).toBe("۳۳ تیم ۳ نفره");
    expect(arenaCompositionLabel("cod_mobile", "solo", 40)).toBe("۴۰ نفر");
  });
});
