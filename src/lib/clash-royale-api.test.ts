import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ClashRoyaleApiError,
  createClashRoyaleApiClient,
  findHeadToHeadBattle,
  normalizeClashRoyaleTag,
  parseClashBattleTime,
} from "@/lib/clash-royale-api";

afterEach(() => vi.restoreAllMocks());

describe("Clash Royale API", () => {
  it("normalizes valid player tags and rejects invalid values", () => {
    expect(normalizeClashRoyaleTag(" #2pyLq0 ")).toBe("#2PYLQ0");
    expect(normalizeClashRoyaleTag("hello!")).toBeNull();
  });

  it("parses Supercell battle timestamps", () => {
    expect(parseClashBattleTime("20260717T101530.000Z")?.toISOString())
      .toBe("2026-07-17T10:15:30.000Z");
    expect(parseClashBattleTime("bad")).toBeNull();
  });

  it("loads a player through the allowlisted proxy without leaking the token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toBe("https://proxy.royaleapi.dev/v1/players/%232PYLQ0");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret-token");
      return new Response(JSON.stringify({ tag: "#2PYLQ0", name: "Player" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const client = createClashRoyaleApiClient({
      token: "secret-token",
      baseUrl: "https://proxy.royaleapi.dev/v1",
      fetchImpl,
    });
    await expect(client.getPlayer("#2PYLQ0")).resolves.toMatchObject({ name: "Player" });
  });

  it("rejects arbitrary API base URLs", async () => {
    const client = createClashRoyaleApiClient({ token: "secret", baseUrl: "https://evil.example/v1" });
    await expect(client.getPlayer("#2PYLQ0")).rejects.toMatchObject({
      message: "CLASH_ROYALE_API_BASE_URL_NOT_ALLOWED",
    } satisfies Partial<ClashRoyaleApiError>);
  });

  it("finds the latest head-to-head battle and determines the winner", () => {
    const battle = findHeadToHeadBattle({
      player1Tag: "#2PYLQ0",
      player2Tag: "#8JCUV",
      notBefore: new Date("2026-07-17T10:00:00.000Z"),
      battles: [{
        battleTime: "20260717T101530.000Z",
        type: "friendly",
        gameMode: { name: "Draft" },
        team: [{ tag: "#2PYLQ0", crowns: 3 }],
        opponent: [{ tag: "#8JCUV", crowns: 1 }],
      }],
    });
    expect(battle).toMatchObject({
      winnerTag: "#2PYLQ0",
      player1Crowns: 3,
      player2Crowns: 1,
      gameMode: "Draft",
    });
  });

  it("ignores battles before the match was created", () => {
    expect(findHeadToHeadBattle({
      player1Tag: "#2PYLQ0",
      player2Tag: "#8JCUV",
      notBefore: new Date("2026-07-17T11:00:00.000Z"),
      battles: [{
        battleTime: "20260717T101530.000Z",
        team: [{ tag: "#2PYLQ0", crowns: 3 }],
        opponent: [{ tag: "#8JCUV", crowns: 1 }],
      }],
    })).toBeNull();
  });
});
