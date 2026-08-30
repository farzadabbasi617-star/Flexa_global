import { describe, expect, it } from "vitest";
import {
  CLASH_1V1_CONFIG,
  isClash1v1QueueTournament,
  normalizeClash1v1QueueSettings,
} from "./clash-1v1";

describe("Clash Royale 1V1 system queue settings", () => {
  it("normalizes the reserved queue into the fixed 50k/80k one-player-prize product", () => {
    const value = normalizeClash1v1QueueSettings({
      name: "wrong",
      game: "clash_royale",
      categoryLabel: CLASH_1V1_CONFIG.categoryLabel,
      maxPlayers: 64,
      serverSlots: 64,
      entryFee: "free",
      prize1st: "0",
      roomId: "ROOM",
      roomPassword: "PASS",
      roomVisibleAt: "2026-07-21T10:00:00.000Z",
    });

    expect(value).toMatchObject({
      name: "1V1 کلش رویال",
      game: "clash_royale",
      categoryLabel: "clash_1v1_queue",
      entryFee: "50,000 USDT",
      prizePool: "80,000 USDT",
      prize1st: "80,000 USDT",
      winnersCount: 1,
      serverSlots: 2,
      roomId: null,
      roomPassword: null,
      roomVisibleAt: null,
    });
  });

  it("does not turn a normal Clash tournament into the system queue by name alone", () => {
    expect(isClash1v1QueueTournament({
      name: CLASH_1V1_CONFIG.name,
      game: "clash_royale",
      categoryLabel: null,
    })).toBe(false);
  });
});
